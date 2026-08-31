"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markPayablePaid, markPayablePending, createManualPayable, createInstallmentPayables, updateManualPayable, isVehiclePurchase, resolveSupplierByName, splitInstallments, addMonths, addDays , correctPaymentDate } from "@/lib/finance";
import { syncCardInvoiceDerived } from "@/lib/card-invoice";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertCan, assertCanAny } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { structuralCenterId } from "@/lib/structural";
import { STRUCTURAL_KEY_VALUES, isStructuralKey } from "@/lib/structural-flows";
import { getNeutralAccountId } from "@/lib/accounts";
import { resolveDespesaCategory } from "@/lib/categories";
import { parseDebtItems, AJUSTE_DEBITOS_DESC, AJUSTE_QUITACAO_DESC } from "@/lib/vehicle-debts";
import { appliedOf, freeCapitalOf } from "@/lib/investments";
import type { CategoriaPagar } from "@prisma/client";

const round2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Converte texto de valor ("1.234,50" ou "1234.5") em número (ou NaN). */
function parseAmountInput(v: string): number {
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Título dentro de combo SOLICITADO não pode ser baixado individualmente: o
 * combo é um pagamento único (quitado inteiro pelo borderô ou pelo card no
 * Contas a pagar). Lança erro citando o primeiro título travado.
 */
async function assertNotInSolicitedCombo(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const locked = await prisma.payable.findFirst({
    where: { id: { in: ids }, paymentCombo: { status: "SOLICITADO" } },
    select: { description: true, paymentCombo: { select: { name: true } } },
  });
  if (locked) {
    throw new Error(
      `O título "${locked.description}" está no combo "${locked.paymentCombo?.name}" aguardando pagamento — o combo é pago de uma vez só, pelo borderô ou pelo card de combos no Contas a pagar.`,
    );
  }
}

/**
 * Baixa a comissão de um vendedor informando o VALOR PAGO A ELE (líquido em
 * dinheiro). A diferença em relação à comissão é acertada no capital do
 * beneficiário vinculado ao vendedor:
 *
 *  - pago > comissão → o EXCEDENTE vira uma RETIRADA de capital (Payable com
 *    capitalBeneficiaryId → syncPayableCapital gera a retirada);
 *  - pago < comissão → a DIFERENÇA (limitada ao saldo devedor) cobre o saldo
 *    devedor do vendedor como um APORTE. O acerto passa pelo Banco Neutro (par
 *    Payable/Receivable que se anula) e NÃO toca o caixa real — só o líquido é
 *    pago na conta escolhida. Assim a equação patrimonial não diverge.
 *  - pago = comissão → baixa simples.
 */
export async function settleCommissionAction(
  payableId: string,
  accountId: string,
  payoutInput: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  if (!accountId) return { ok: false, error: "Escolha a conta que fará o pagamento." };
  try {
    await assertNotInSolicitedCombo([payableId]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Título em combo solicitado." };
  }
  // A baixa usa sempre a data de trabalho do caixa aberto.
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    select: {
      id: true,
      category: true,
      status: true,
      amount: true,
      beneficiaryUserId: true,
      saleId: true,
      costCenterId: true,
      description: true,
      notes: true,
    },
  });
  if (!payable) return { ok: false, error: "Título não encontrado." };
  if (payable.status === "PAGO") return { ok: false, error: "Este título já está pago." };
  if (payable.category !== "COMISSAO" || !payable.beneficiaryUserId) {
    return { ok: false, error: "Esta baixa só vale para comissões de um vendedor." };
  }

  const payout = parseAmountInput(payoutInput);
  if (!Number.isFinite(payout) || payout < 0) return { ok: false, error: "Informe o valor pago ao vendedor." };
  const comissao = payable.amount;
  const diff = round2(comissao - payout); // > 0 abate no capital; < 0 excedente (retirada)

  const done = () => {
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/financeiro/fluxo-caixa");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/financeiro/contas");
    revalidatePath("/capital");
    revalidatePath("/minhas-comissoes");
    revalidatePath("/");
    return { ok: true as const };
  };

  // Qualquer acerto de capital exige o vendedor vinculado a um beneficiário.
  let beneficiary: { id: string; name: string } | null = null;
  if (Math.abs(diff) > 0.005) {
    beneficiary = await prisma.capitalBeneficiary.findUnique({
      where: { userId: payable.beneficiaryUserId },
      select: { id: true, name: true },
    });
    if (!beneficiary) {
      return {
        ok: false,
        error: "Este vendedor não está vinculado a um beneficiário do capital — não é possível acertar o capital.",
      };
    }
  }

  // Excedente: paga mais que a comissão → o excedente vira RETIRADA de capital.
  if (diff < -0.005 && beneficiary) {
    const excedente = round2(-diff);
    await markPayablePaid(payableId, date, accountId);
    const capitalCenterId = await structuralCenterId("CAPITAL");
    const extra = await prisma.payable.create({
      data: {
        costCenterId: capitalCenterId,
        description: `Excedente de comissão (retirada de capital) - ${beneficiary.name}`,
        category: "OUTROS",
        amount: excedente,
        dueDate: date,
        status: "PENDENTE",
        capitalBeneficiaryId: beneficiary.id,
        beneficiaryUserId: payable.beneficiaryUserId,
      },
    });
    await markPayablePaid(extra.id, date, accountId);
    return done();
  }

  // Aplicar no capital: paga menos que a comissão → a diferença vira APORTE no
  // capital do vendedor (via Banco Neutro, sem tocar o caixa real). Vale com ou
  // sem saldo devedor — o vendedor pode deixar a comissão (inteira ou parte)
  // como capital.
  if (diff > 0.005 && beneficiary) {
    const abate = diff;
    const [capitalCenterId, neutralAccountId] = await Promise.all([
      structuralCenterId("CAPITAL"),
      getNeutralAccountId(),
    ]);
    // Quando NÃO se paga nada ao vendedor (payout 0 = tudo no capital), não faz
    // sentido gerar uma linha de comissão de R$ 0 "líquido ao vendedor": o
    // próprio título vira o "aplicado no capital". Só divide em duas linhas
    // quando há um líquido de fato pago em dinheiro (payout > 0).
    const applyAll = payout <= 0.005;
    // Observação na Ordem de pagamento: a comissão bruta, o quanto foi aplicado
    // no capital e (quando houver) o líquido pago ao vendedor.
    const breakdownNote = applyAll
      ? `Comissão bruta ${brl(comissao)}. Aplicado ${brl(abate)} no capital de ${beneficiary.name}.`
      : `Comissão bruta ${brl(comissao)}. Aplicado ${brl(abate)} no capital de ${beneficiary.name}. Líquido pago ao vendedor ${brl(payout)}.`;
    const liquidoNotes = [payable.notes?.trim() || null, breakdownNote].filter(Boolean).join(" — ");
    await prisma.$transaction(async (tx) => {
      if (applyAll) {
        // 1) Tudo no capital: o próprio título vira o "aplicado no capital",
        //    PAGO no Banco Neutro (não toca o caixa real). Sem linha de R$ 0.
        await tx.payable.update({
          where: { id: payableId },
          data: {
            amount: abate,
            status: "PAGO",
            paymentDate: date,
            accountId: neutralAccountId,
            description: `${payable.description} (aplicado no capital)`,
            notes: liquidoNotes,
          },
        });
      } else {
        // 1) O próprio título da comissão vira o líquido pago ao vendedor (conta real).
        await tx.payable.update({
          where: { id: payableId },
          data: {
            amount: payout,
            status: "PAGO",
            paymentDate: date,
            accountId,
            description: `${payable.description} (líquido ao vendedor)`,
            notes: liquidoNotes,
          },
        });
        // 2) Parte aplicada no capital: comissão PAGA no Banco Neutro (não passa
        //    pelo caixa real).
        await tx.payable.create({
          data: {
            costCenterId: payable.costCenterId,
            description: `${payable.description} (aplicado no capital)`,
            category: "COMISSAO",
            amount: abate,
            dueDate: date,
            paymentDate: date,
            status: "PAGO",
            accountId: neutralAccountId,
            saleId: payable.saleId,
            beneficiaryUserId: payable.beneficiaryUserId,
          },
        });
      }
      // 3) Aporte do vendedor: Receivable RECEBIDO no Banco Neutro (centro
      //    Capital) + CapitalTransaction APORTE. O par com o payable acima zera o
      //    Banco Neutro; o aporte eleva o capital do vendedor. Ambos carregam o
      //    saleId da comissão: se a venda for cancelada, cancelVehicleSale apaga
      //    o par inteiro (senão o recebível ficaria órfão no Banco Neutro,
      //    divergindo o Check 1).
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenterId,
          description: `Aporte de comissão no capital - ${beneficiary!.name}`,
          category: "OUTROS",
          amount: abate,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId: neutralAccountId,
          capitalBeneficiaryId: beneficiary!.id,
          saleId: payable.saleId,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: beneficiary!.id,
          kind: "APORTE",
          amount: abate,
          date,
          description: `Aporte da ${payable.description}`,
          receivableId: receivable.id,
          saleId: payable.saleId,
        },
      });
    });
    return done();
  }

  // Valor igual à comissão: baixa simples.
  await markPayablePaid(payableId, date, accountId);
  return done();
}

export async function markPaidAction(id: string, accountId?: string) {
  await assertCan("financeiro", "pagar");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await assertNotInSolicitedCombo([id]);
  await markPayablePaid(id, await getCashboxWorkDate(), accountId || null);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

export type PartialPayResult = { ok: boolean; error?: string };

/**
 * Pagamento PARCIAL de um título: paga só uma parte agora e deixa o saldo em
 * aberto. Modelado como desmembramento (mantém cada título integralmente pago ou
 * pendente — o farol continua simples): o título original é reduzido ao SALDO
 * restante (segue PENDENTE, mesmo nº) e nasce um título novo com o VALOR PAGO,
 * baixado na conta/data escolhidas. O título pago herda o destino contábil
 * (veículo, sócio do capital, fornecedor, categoria, vendedor, funcionário),
 * então retirada de capital, custo de veículo etc. saem corretos pela parte
 * paga; os rastreadores de origem (recorrência, solicitação de compra…) ficam no
 * saldo pendente. Não vale para fatura de cartão nem compra de veículo (o valor
 * desses vem de outra origem).
 */
export async function payPartialAction(
  id: string,
  amountToPay: number,
  accountId: string,
): Promise<PartialPayResult> {
  if (!id) return { ok: false, error: "Título inválido." };
  if (!accountId) return { ok: false, error: "Escolha a conta que fará o pagamento." };
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }

  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
    await assertNotInSolicitedCombo([id]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const p = await prisma.payable.findUnique({
    where: { id },
    select: {
      status: true,
      amount: true,
      description: true,
      category: true,
      categoryLabel: true,
      documentNumber: true,
      dueDate: true,
      vehicleId: true,
      saleId: true,
      supplierId: true,
      costCenterId: true,
      capitalBeneficiaryId: true,
      beneficiaryUserId: true,
      employeeId: true,
      notes: true,
      cardInvoice: true,
      paymentComboId: true,
    },
  });
  if (!p) return { ok: false, error: "Título não encontrado." };
  if (p.status === "PAGO") return { ok: false, error: "Título já pago." };
  if (p.paymentComboId) {
    return { ok: false, error: "Título está num combo de pagamento. Remova-o do combo antes." };
  }
  if (p.cardInvoice) {
    return { ok: false, error: "Fatura de cartão não pode ser paga parcialmente por aqui." };
  }
  if (p.category === "COMPRA_VEICULO") {
    return { ok: false, error: "Título de compra de veículo não permite pagamento parcial." };
  }

  const amount = round2(amountToPay);
  const total = round2(p.amount);
  if (!(amount > 0)) return { ok: false, error: "Informe um valor válido para pagar." };
  if (amount >= total) {
    return { ok: false, error: `Para pagar o total use "Pagar título". O parcial deve ser menor que ${brl(total)}.` };
  }
  const remaining = round2(total - amount);

  // Reduz o original ao saldo e cria a parte paga (destino contábil copiado; sem
  // rastreadores de origem). Baixa a parte paga fora da transação (markPayablePaid
  // roda os próprios syncs/transação de capital, cartão e solicitação).
  const paidId = await prisma.$transaction(async (tx) => {
    await tx.payable.update({ where: { id }, data: { amount: remaining } });
    const child = await tx.payable.create({
      data: {
        description: `${p.description} (pagamento parcial)`,
        category: p.category,
        categoryLabel: p.categoryLabel,
        documentNumber: p.documentNumber,
        amount,
        dueDate: p.dueDate,
        status: "PENDENTE",
        vehicleId: p.vehicleId,
        saleId: p.saleId,
        supplierId: p.supplierId,
        costCenterId: p.costCenterId,
        capitalBeneficiaryId: p.capitalBeneficiaryId,
        beneficiaryUserId: p.beneficiaryUserId,
        employeeId: p.employeeId,
        notes: p.notes,
      },
      select: { id: true },
    });
    return child.id;
  });

  await markPayablePaid(paidId, date, accountId);

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true };
}

export type PayBatchResult = { ok: boolean; paid: number; error?: string };

/**
 * Baixa um ou vários títulos de uma vez pela conta escolhida (pagamento em
 * lote). A data da baixa é sempre a data de trabalho do caixa aberto.
 */
export async function payBatchAction(
  ids: string[],
  accountId: string,
): Promise<PayBatchResult> {
  if (!ids.length) return { ok: false, paid: 0, error: "Selecione ao menos um título." };
  if (!accountId) return { ok: false, paid: 0, error: "Escolha a conta que fará o pagamento." };
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
    await assertNotInSolicitedCombo(ids);
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : "Mês fechado." };
  }
  let paid = 0;
  for (const id of ids) {
    await markPayablePaid(id, date, accountId);
    paid += 1;
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { ok: true, paid };
}

/**
 * Paga títulos de RETIRADA de capital de um sócio cujo capital está APLICADO,
 * com SUBSTITUIÇÃO: outro sócio assume a fatia aplicada (o capital livre dele
 * vira aplicado). Mesma mecânica do "Sacar com substituição" da tela de Capital,
 * só que baixando títulos que já existem. Só vale para retiradas de capital
 * pendentes, do MESMO sócio, sem veículo vinculado.
 */
export async function payWithSubstitutionAction(
  ids: string[],
  opts: { payFromAccountId: string; applicationAccountId: string; substituteId: string },
): Promise<PayBatchResult> {
  if (!ids.length) return { ok: false, paid: 0, error: "Selecione ao menos um título." };
  if (!opts.payFromAccountId || !opts.applicationAccountId || !opts.substituteId) {
    return { ok: false, paid: 0, error: "Escolha a conta que paga, a aplicação da fatia e o sócio substituto." };
  }
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
    await assertNotInSolicitedCombo(ids);
  } catch (e) {
    return { ok: false, paid: 0, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const rows = await prisma.payable.findMany({
    where: { id: { in: ids } },
    select: { id: true, amount: true, status: true, capitalBeneficiaryId: true, vehicleId: true },
  });
  if (rows.length !== ids.length) return { ok: false, paid: 0, error: "Título não encontrado." };
  const benefId = rows[0].capitalBeneficiaryId;
  if (
    !benefId ||
    rows.some((r) => r.capitalBeneficiaryId !== benefId || r.vehicleId || r.status === "PAGO")
  ) {
    return {
      ok: false,
      paid: 0,
      error: "Selecione apenas retiradas de capital pendentes do mesmo sócio (sem veículo vinculado).",
    };
  }
  if (opts.substituteId === benefId) {
    return { ok: false, paid: 0, error: "O substituto precisa ser outro sócio." };
  }
  const appAccount = await prisma.financialAccount.findUnique({
    where: { id: opts.applicationAccountId },
    select: { isInvestment: true },
  });
  if (!appAccount?.isInvestment) {
    return { ok: false, paid: 0, error: "A conta da fatia precisa ser uma conta de Aplicação." };
  }
  const [benef, sub] = await Promise.all([
    prisma.capitalBeneficiary.findUnique({ where: { id: benefId }, select: { name: true } }),
    prisma.capitalBeneficiary.findUnique({
      where: { id: opts.substituteId },
      select: { name: true, active: true },
    }),
  ]);
  if (!benef || !sub) return { ok: false, paid: 0, error: "Sócio não encontrado." };
  if (!sub.active) return { ok: false, paid: 0, error: "Substituto inativo." };

  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  // O substituto assume só a fatia REALMENTE aplicada (o excedente vira overdraw
  // no capital do sócio, sem substituição — igual ao "Sacar com substituição").
  const applied = await appliedOf(opts.applicationAccountId, benefId);
  const swapTotal = round2(Math.min(total, applied));
  const free = await freeCapitalOf(opts.substituteId);
  if (swapTotal > free + 0.01) {
    return {
      ok: false,
      paid: 0,
      error: `${sub.name} tem apenas ${brl(free)} de capital livre para assumir a fatia de ${brl(swapTotal)}.`,
    };
  }

  let remaining = swapTotal;
  let paid = 0;
  for (const p of rows) {
    // Baixa o título (gera a retirada do sócio via syncPayableCapital)...
    await markPayablePaid(p.id, date, opts.payFromAccountId);
    // ...e troca o dono da fatia aplicada (líquido zero na conta de Aplicação),
    // distribuindo o swap entre os títulos e limitado ao que estava aplicado.
    const swap = round2(Math.min(p.amount, remaining));
    remaining = round2(remaining - swap);
    if (swap > 0) {
      await prisma.investmentAllocation.createMany({
        data: [
          {
            accountId: opts.applicationAccountId,
            beneficiaryId: benefId,
            kind: "SUBSTITUICAO",
            amount: -swap,
            date,
            description: `Fatia assumida por ${sub.name}`,
            payableId: p.id,
          },
          {
            accountId: opts.applicationAccountId,
            beneficiaryId: opts.substituteId,
            kind: "SUBSTITUICAO",
            amount: swap,
            date,
            description: `Assumiu a fatia de ${benef.name}`,
            payableId: p.id,
          },
        ],
      });
    }
    paid += 1;
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true, paid };
}

/**
 * Define (ou corrige) o fornecedor de um título já lançado. Metadado puro —
 * não mexe em valores, status nem saldos. Serve para consertar contas antigas
 * lançadas sem fornecedor (ex.: compra concluída sem fornecedor sugerido).
 */
export async function setPayableSupplierAction(
  id: string,
  supplierId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
    await prisma.payable.update({
      where: { id },
      data: { supplierId: supplierId || null },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/livro-caixa");
  return { ok: true };
}

/**
 * Corrige a data de um pagamento já feito. Ação de CORREÇÃO: não exige caixa
 * aberto (a data do caixa é justamente o que estava errado) nem farol verde.
 * Os dois meses envolvidos têm de estar abertos — mover um valor para dentro
 * ou para fora de um mês encerrado bagunçaria o fechamento. Move junto o que
 * está ligado por chave estrangeira: a movimentação de capital e o custo de
 * veículo gerados por este título.
 */
export async function correctPaymentDateAction(
  id: string,
  dateInput: string,
): Promise<{ ok: boolean; movedCapital?: boolean; movedVehicleCost?: boolean; error?: string }> {
  if (!dateInput) return { ok: false, error: "Escolha a data." };
  try {
    await assertCan("financeiro", "corrigirdata");
    const newDate = parseDateInput(dateInput);
    const current = await prisma.payable.findUnique({
      where: { id },
      select: { paymentDate: true },
    });
    if (current?.paymentDate) await assertMonthOpen(current.paymentDate);
    await assertMonthOpen(newDate);
    const res = await correctPaymentDate(id, newDate);
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/financeiro/fluxo-caixa");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/financeiro/contas");
    revalidatePath("/capital");
    revalidatePath("/estoque");
    revalidatePath("/relatorios/lucro-veiculos");
    revalidatePath("/");
    return { ok: true, movedCapital: res.movedCapital, movedVehicleCost: res.movedVehicleCost };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível corrigir a data." };
  }
}

export async function markPendingAction(id: string) {
  await assertCan("financeiro", "pagar");
  await markPayablePending(id);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

const manualSchema = z.object({
  description: z.string().min(1, "Informe a descrição"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  // À vista (título único) ou parcelado em N vezes.
  paymentMode: z.enum(["A_VISTA", "PARCELADO"]).default("A_VISTA"),
  installmentsCount: z.coerce.number().int().min(0).default(0),
  // Vencimentos do parcelado: MENSAL (todo mês, mesmo dia) ou a cada X DIAS.
  installmentPeriod: z.enum(["MENSAL", "DIAS"]).default("MENSAL"),
  installmentDays: z.coerce.number().int().min(1).default(30),
  supplierName: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(STRUCTURAL_KEY_VALUES).optional(),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
});

export type ManualPayableState = { error?: string };

export async function createManualPayableAction(
  _prev: ManualPayableState,
  formData: FormData,
): Promise<ManualPayableState> {
  try {
    await assertCan("financeiro", "criar");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = manualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    // Título PENDENTE não movimenta dinheiro — pode ser criado com o caixa
    // fechado e com vencimento em QUALQUER data, inclusive em mês já fechado
    // (o L/P e o fechamento contam pelo PAGAMENTO, não pelo vencimento — o
    // título só entra em Contas a pagar como atrasado). A trava do mês vale
    // apenas quando "já foi pago": a baixa cai na data do vencimento e aí sim
    // mexeria no resultado do mês fechado.
    if (d.paymentMode === "A_VISTA" && d.alreadyPaid) {
      await assertCashboxOpen();
      await assertMonthOpen(parseDateInput(d.dueDate));
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }

  const label = (d.categoryLabel || "").trim();
  const isCapital = d.structuralKey === "CAPITAL";
  const supplierName = (d.supplierName || "").trim();

  // Toda conta precisa de categoria; e de fornecedor — exceto no Capital, onde
  // o fornecedor é opcional (o valor pode ter sido pago ao próprio beneficiário).
  if (!label) return { error: "Informe a categoria." };
  if (isCapital && !d.capitalBeneficiaryId) return { error: "Escolha o beneficiário do capital." };
  if (!supplierName && !isCapital) return { error: "Informe o fornecedor." };

  // Resolve a categoria (rótulo canônico + enum); cria custom se for nova.
  const cat = await resolveDespesaCategory(label);

  // Parcelamento: N títulos mensais a partir do 1º vencimento. "Já foi pago"
  // só vale à vista (parcelas futuras nascem pendentes).
  const parcelado = d.paymentMode === "PARCELADO";
  const count = parcelado ? d.installmentsCount : 1;
  if (parcelado && count < 2) return { error: "Informe o número de parcelas (2 ou mais)." };

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // No Capital pode ficar vazio — o pagamento foi ao próprio beneficiário.
  const supplierId = supplierName ? await resolveSupplierByName(supplierName) : null;

  const firstDue = parseDateInput(d.dueDate);
  const amounts = count > 1 ? splitInstallments(d.amount, count) : [d.amount];
  const dueDateOf = (i: number) =>
    d.installmentPeriod === "DIAS" ? addDays(firstDue, i * d.installmentDays) : addMonths(firstDue, i);
  const destino = {
    category: cat.category,
    categoryLabel: cat.label,
    documentNumber: d.documentNumber?.trim() || null,
    supplierId,
    costCenterId: isCapital ? null : d.costCenterId || null,
    structuralKey: d.structuralKey,
    vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
    capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
    notes: d.notes || null,
  };

  if (count > 1) {
    // Parcelado: todas as parcelas de uma vez só (nascem pendentes). Criar uma a
    // uma deixava lançamentos longos — 360 parcelas — insuportavelmente lentos.
    await createInstallmentPayables({
      ...destino,
      parcels: amounts.map((amount, i) => ({
        description: `${d.description} - Parcela ${i + 1}/${count}`,
        amount,
        dueDate: dueDateOf(i),
      })),
    });
  } else {
    await createManualPayable({
      ...destino,
      description: d.description,
      amount: amounts[0],
      dueDate: firstDue,
      alreadyPaid: Boolean(d.alreadyPaid),
    });
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect("/financeiro/a-pagar");
}

// ---------------------------------------------------------------------------
// Editar / excluir título manual (não pago e sem origem em outra operação).
// ---------------------------------------------------------------------------

/** Campos que indicam que o título veio de outra operação (ajustar na origem). */
const ORIGIN_SELECT = {
  status: true,
  vehicleId: true,
  partId: true,
  recurringId: true,
  consortiumId: true,
  employeeId: true,
  saleId: true,
  purchaseRequestId: true,
} as const;

function originBlockReason(p: {
  status: string;
  vehicleId: string | null;
  partId: string | null;
  recurringId: string | null;
  consortiumId: string | null;
  employeeId: string | null;
  saleId: string | null;
  purchaseRequestId: string | null;
}): string | null {
  if (p.status === "PAGO") return "pago";
  // Veículo é permitido excluir (remove o custo do veículo junto). Recorrência
  // não pago também pode: o dia excluído vira "pulado" na recorrência (não
  // regenera). Consórcio se regenera; venda/peça/espelho têm origem própria.
  if (p.partId || p.consortiumId || p.employeeId || p.saleId || p.purchaseRequestId) {
    return "origem";
  }
  return null;
}

const updatePayableSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Informe a descrição"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
  structuralKey: z.enum(STRUCTURAL_KEY_VALUES).optional(),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
});

export type EditPayableState = { error?: string };

/**
 * Edita um título não pago — dados do título e destino (fluxo/veículo/beneficiário).
 * Sincroniza o custo do veículo e o centro de custo. Pagos precisam ser revertidos.
 */
export async function updatePayableAction(
  _prev: EditPayableState,
  formData: FormData,
): Promise<EditPayableState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
      ["combos", "criar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updatePayableSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const current = await prisma.payable.findUnique({
    where: { id: d.id },
    select: {
      status: true,
      saleId: true,
      recurringId: true,
      dueDate: true,
      category: true,
      amount: true,
      description: true,
      vehicleId: true,
      costCenter: { select: { key: true } },
      vehicle: { select: { consigned: true, payoffAmount: true, debtsAmount: true } },
    },
  });
  if (!current) return { error: "Título não encontrado." };
  if (current.status === "PAGO") return { error: "Título já pago. Reverta antes de editar." };

  const label = (d.categoryLabel || "").trim();
  if (!label) return { error: "Informe a categoria." };

  // Título gerado por uma venda (comissão do vendedor, indicação, transferência
  // DETRAN): o DESTINO CONTÁBIL fica travado. Esse custo já foi reconhecido no
  // resultado na data da venda, e o carro já está ligado a ele pela própria
  // venda. Atrelar o veículo aqui criaria um custo pós-venda no carro e o mesmo
  // gasto contaria duas vezes; mandar para o Capital viraria retirada de sócio.
  // Nos dois casos o farol quebraria. Descrição, valor, vencimento, fornecedor
  // (o despachante, por exemplo) e o nome da categoria seguem livres.
  const saleGenerated = Boolean(current.saleId);
  // Título que É a compra do carro: o valor vem do "preço de compra" do veículo
  // e o carro já está ligado a ele. Salvar por aqui sem trava criava um custo do
  // veículo com o próprio preço de compra (o mesmo dinheiro contado 2×) e
  // rebaixava a categoria para OUTROS, soltando o título de
  // regenerateVehicleAcquisitionPayables (que passaria a criar um 2º título).
  const isAcquisition = isVehiclePurchase(current.category);
  // Título de DÉBITOS/QUITAÇÃO da compra (o valor descontado do cliente/vendedor
  // no momento da compra — IPVA, multa, licenciamento, quitação): o valor PODE
  // ser ajustado. É o caso do pagamento com desconto (ex.: multa paga com 20%
  // off) — a diferença é da loja: acréscimo vira custo do veículo, desconto
  // vira ganho (custo negativo), por competência. Vale para consignado E
  // veículo próprio. Só o título "Compra do veículo" (preço de compra) segue
  // travado — esse muda no Estoque.
  const repasseDebito =
    isAcquisition &&
    !current.saleId &&
    (current.description.startsWith("Débitos do veículo") ||
      current.description.startsWith("Quitação do financiamento"));
  const locked = saleGenerated || isAcquisition;
  const currentFlow = isStructuralKey(current.costCenter?.key)
    ? current.costCenter.key
    : "ADMINISTRATIVO";
  const flow = locked ? currentFlow : d.structuralKey || "ADMINISTRATIVO";
  // Na compra do carro o vínculo com o veículo PRECISA continuar (é o título
  // de aquisição dele); no título gerado por venda, o vínculo é pela venda.
  const vehicleId = isAcquisition
    ? current.vehicleId
    : !saleGenerated && flow === "VEICULOS"
      ? d.vehicleId || null
      : null;
  const capitalBeneficiaryId = !locked && flow === "CAPITAL" ? d.capitalBeneficiaryId || null : null;
  if (!locked && flow === "CAPITAL" && !capitalBeneficiaryId) {
    return { error: "Escolha o beneficiário do capital." };
  }

  const cat = await resolveDespesaCategory(label);
  // Pelo mesmo motivo, a CATEGORIA INTERNA desses títulos fica travada: é ela
  // que diz à equação patrimonial que aquilo é custo daquela venda (ou a compra
  // do carro). O nome exibido pode ser trocado à vontade.
  const category = locked ? current.category : cat.category;
  // O valor da compra do carro é o preço de compra do veículo — muda no Estoque.
  // Exceção: débitos/quitação da compra, cujo ajuste vira custo/ganho do veículo.
  const amount = isAcquisition && !repasseDebito ? current.amount : d.amount;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const repasseDelta = repasseDebito ? round2(d.amount - current.amount) : 0;

  await updateManualPayable({
    id: d.id,
    description: d.description,
    category,
    categoryLabel: cat.label,
    documentNumber: d.documentNumber?.trim() || null,
    amount,
    // Título de recorrência: o vencimento vem dela. O gerador não repete um dia
    // que já tem título — mudar a data aqui liberaria o dia original e faria
    // nascer um título duplicado.
    dueDate: current.recurringId ? current.dueDate : parseDateInput(d.dueDate),
    supplierId: d.supplierId || null,
    notes: d.notes?.trim() || null,
    structuralKey: flow,
    vehicleId,
    capitalBeneficiaryId,
  });
  // Débitos/quitação da compra: a contrapartida da mudança de valor é um CUSTO
  // de ajuste do veículo (acréscimo = perda; desconto = ganho, custo negativo),
  // por competência — o acordado/descontado no momento da compra não muda.
  if (repasseDebito && Math.abs(repasseDelta) > 0.005 && current.vehicleId) {
    const isPayoff = current.description.startsWith("Quitação do financiamento");
    await prisma.vehicleCost.create({
      data: {
        vehicleId: current.vehicleId,
        description: isPayoff ? AJUSTE_QUITACAO_DESC : AJUSTE_DEBITOS_DESC,
        category: "OUTROS",
        amount: repasseDelta,
        date: new Date(),
        postSale: false,
        notes: `Título ajustado de ${brl(current.amount)} para ${brl(d.amount)} (edição manual).`,
      },
    });
  }

  // Fatura de cartão: o valor do título é a soma dos lançamentos — se o valor
  // digitado divergir, a sincronização corrige (e realinha custos por item).
  await syncCardInvoiceDerived(d.id);

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  // Volta para a origem (ex.: o combo), se for caminho interno do financeiro.
  const rt = String(formData.get("returnTo") || "");
  redirect(rt.startsWith("/financeiro/") ? rt : "/financeiro/a-pagar");
}

export type SplitRepasseState = { error?: string };

/**
 * Desmembra o título "Débitos do veículo (repasse)" de um CONSIGNADO em várias
 * guias (IPVA, multas, licenciamento...) — cada linha vira um título próprio,
 * com o seu vencimento, pagável separadamente. Funciona mesmo DEPOIS da venda.
 *
 * Mesma lógica da edição de valor do repasse: a diferença entre a soma das
 * guias e o valor DESCONTADO do dono (o título original) flui para a Devolução
 * ao proprietário pendente — guias mais baratas → sobra mais para o dono; mais
 * caras → sobra menos. O acertado e o lucro da venda não mudam (farol verde).
 * O campo de débitos do veículo acompanha a soma real, para o detalhamento da
 * venda continuar batendo com os títulos.
 */
export async function splitConsignedRepasseAction(
  _prev: SplitRepasseState,
  formData: FormData,
): Promise<SplitRepasseState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Título não informado." };
  const items = parseDebtItems(formData.get("items")).filter((d) => d.amount > 0);
  if (!items.length) return { error: "Informe ao menos uma guia com valor." };

  const current = await prisma.payable.findUnique({
    where: { id },
    select: {
      status: true,
      saleId: true,
      category: true,
      amount: true,
      dueDate: true,
      description: true,
      vehicleId: true,
      costCenterId: true,
      supplierId: true,
      paymentComboId: true,
      vehicle: { select: { consigned: true, debtsAmount: true, brand: true, model: true, plate: true } },
    },
  });
  if (!current) return { error: "Título não encontrado." };
  if (current.status === "PAGO") return { error: "Título já pago. Reverta antes de desmembrar." };
  if (
    current.category !== "COMPRA_VEICULO" ||
    current.saleId ||
    !current.vehicleId ||
    !current.vehicle?.consigned ||
    !current.description.startsWith("Débitos do veículo")
  ) {
    return { error: "Só o título de débitos do repasse de um consignado pode ser desmembrado." };
  }
  if (current.paymentComboId) {
    return { error: "Este título está num combo de pagamento. Remova-o do combo antes de desmembrar." };
  }

  const total = round2(items.reduce((s, d) => s + d.amount, 0));
  const delta = round2(total - current.amount);

  // Diferença entre as guias reais e o descontado do dono: mesma regra do
  // veículo próprio — vira custo de ajuste do veículo (acréscimo = perda da
  // loja; desconto = ganho). A devolução ao proprietário não muda.
  const repasseLabel = `${current.vehicle.brand} ${current.vehicle.model} - placa ${current.vehicle.plate}`;
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.payable.create({
        data: {
          description: `Débitos do veículo: ${item.description || "sem descrição"} ${repasseLabel}`,
          category: "COMPRA_VEICULO",
          amount: item.amount,
          dueDate: item.dueDate ? parseDateInput(item.dueDate) : current.dueDate,
          status: "PENDENTE",
          vehicleId: current.vehicleId,
          supplierId: current.supplierId,
          costCenterId: current.costCenterId,
        },
      });
    }
    await tx.payable.delete({ where: { id } });
    if (Math.abs(delta) > 0.005) {
      await tx.vehicleCost.create({
        data: {
          vehicleId: current.vehicleId!,
          description: AJUSTE_DEBITOS_DESC,
          category: "OUTROS",
          amount: delta,
          date: new Date(),
          postSale: false,
          notes: `Guias ${brl(total)} · descontado do proprietário ${brl(current.amount)} (desmembramento).`,
        },
      });
    }
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/estoque");
  revalidatePath("/vendas");
  revalidatePath("/");
  const rt = String(formData.get("returnTo") || "");
  redirect(rt.startsWith("/financeiro/") ? rt : "/financeiro/a-pagar");
}

/**
 * Categorias que podem ser desmembradas em vários títulos com a MESMA soma:
 * devoluções geradas por venda (excedente do financiamento ao cliente e líquido
 * ao consignante). O valor total é ancorado na venda — por isso a soma precisa
 * bater exatamente; o que se ganha é pagar em partes, cada uma com a sua data.
 * Os títulos-filhos mantêm categoria e veículo, então o cancelamento da venda
 * (que limpa por categoria+veículo) e a equação patrimonial seguem intactos.
 */
const SPLIT_SAME_TOTAL_CATEGORIES = ["DEVOLUCAO_CLIENTE", "DEVOLUCAO_PROPRIETARIO"] as const;

export type SplitSameTotalState = { error?: string };

/**
 * Desmembra um título de devolução (cliente/proprietário) em vários títulos —
 * cada linha com valor e vencimento próprios, paga separadamente. A soma das
 * linhas PRECISA ser igual ao valor do título original: nada aqui muda o quanto
 * é devido (isso vem da venda), só COMO será pago.
 */
export async function splitSameTotalAction(
  _prev: SplitSameTotalState,
  formData: FormData,
): Promise<SplitSameTotalState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Título não informado." };
  const items = parseDebtItems(formData.get("items")).filter((d) => d.amount > 0);
  if (items.length < 2) return { error: "Informe ao menos duas linhas com valor — desmembrar é dividir em partes." };

  const current = await prisma.payable.findUnique({
    where: { id },
    select: {
      status: true,
      category: true,
      amount: true,
      dueDate: true,
      description: true,
      vehicleId: true,
      saleId: true,
      supplierId: true,
      costCenterId: true,
      capitalBeneficiaryId: true,
      notes: true,
      paymentComboId: true,
    },
  });
  if (!current) return { error: "Título não encontrado." };
  if (current.status === "PAGO") return { error: "Título já pago. Reverta antes de desmembrar." };
  if (!(SPLIT_SAME_TOTAL_CATEGORIES as readonly string[]).includes(current.category)) {
    return { error: "Este título não pode ser desmembrado por aqui." };
  }
  if (current.paymentComboId) {
    return { error: "Este título está num combo de pagamento. Remova-o do combo antes de desmembrar." };
  }

  const total = round2(items.reduce((s, d) => s + d.amount, 0));
  const diff = round2(total - current.amount);
  if (Math.abs(diff) > 0.005) {
    return {
      error: `A soma das linhas (${brl(total)}) precisa ser igual ao valor do título (${brl(current.amount)}) — o total devido vem da venda e não muda aqui. Diferença: ${brl(diff)}.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const [i, item] of items.entries()) {
      await tx.payable.create({
        data: {
          description: item.description
            ? `${item.description} - ${current.description}`
            : `${current.description} (${i + 1}/${items.length})`,
          category: current.category,
          amount: item.amount,
          dueDate: item.dueDate ? parseDateInput(item.dueDate) : current.dueDate,
          status: "PENDENTE",
          vehicleId: current.vehicleId,
          saleId: current.saleId,
          supplierId: current.supplierId,
          costCenterId: current.costCenterId,
          capitalBeneficiaryId: current.capitalBeneficiaryId,
          notes: current.notes,
        },
      });
    }
    await tx.payable.delete({ where: { id } });
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
  const rt = String(formData.get("returnTo") || "");
  redirect(rt.startsWith("/financeiro/") ? rt : "/financeiro/a-pagar");
}

export type DeletePayablesResult = { ok: boolean; deleted: number; skipped: number; error?: string };

/**
 * Exclui um ou vários títulos manuais e NÃO pagos. Títulos pagos ou vindos de
 * outra operação são ignorados (contam em `skipped`). Remove também eventual
 * movimentação de capital vinculada.
 */
export async function deletePayablesAction(ids: string[]): Promise<DeletePayablesResult> {
  if (!ids.length) return { ok: false, deleted: 0, skipped: 0, error: "Selecione ao menos um título." };
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, deleted: 0, skipped: 0, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  // Valida todos de uma vez e apaga em lote: título a título, excluir dezenas de
  // linhas levava centenas de idas ao banco (a checagem é só em memória).
  const rows = await prisma.payable.findMany({
    where: { id: { in: ids } },
    select: { id: true, dueDate: true, ...ORIGIN_SELECT },
  });
  const okRows = rows.filter((p) => !originBlockReason(p));
  const okIds = okRows.map((p) => p.id);
  const deleted = okIds.length;
  const skipped = ids.length - deleted;

  if (okIds.length) {
    // Título de RECORRÊNCIA: o dia do vencimento vira "pulado" na recorrência,
    // senão a geração automática recriaria o título excluído.
    const skipByRecurring = new Map<string, string[]>();
    for (const p of okRows) {
      if (p.recurringId) {
        const key = p.dueDate.toISOString().slice(0, 10);
        const list = skipByRecurring.get(p.recurringId) ?? [];
        if (!list.includes(key)) list.push(key);
        skipByRecurring.set(p.recurringId, list);
      }
    }
    await prisma.$transaction([
      // O custo do veículo perderia o vínculo (SetNull) e a movimentação de
      // capital não tem cascade — os dois saem junto com o título. A troca de
      // fatia aplicada (substituição) também é vinculada ao título.
      prisma.vehicleCost.deleteMany({ where: { payableId: { in: okIds } } }),
      prisma.capitalTransaction.deleteMany({ where: { payableId: { in: okIds } } }),
      prisma.investmentAllocation.deleteMany({ where: { payableId: { in: okIds } } }),
      prisma.payable.deleteMany({ where: { id: { in: okIds } } }),
      ...Array.from(skipByRecurring.entries()).map(([recurringId, days]) =>
        prisma.recurringEntry.update({
          where: { id: recurringId },
          data: { skippedDays: { push: days } },
        }),
      ),
    ]);
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: deleted > 0, deleted, skipped };
}

export type ImportReceiptsResult = {
  ok: boolean;
  error?: string;
  attached: { title: string; receipt: string }[];
  unmatched: { receipt: string; reason: string }[];
};

/**
 * Importa um PDF de COMPROVANTES DE PAGAMENTO (lote do banco, um por página):
 * a IA lê valor/data/descrição de cada comprovante e o sistema casa com o
 * título PAGO de mesmo valor (data de pagamento próxima) que ainda não tem
 * comprovante — anexando SÓ a página daquele comprovante ao título (slot
 * COMPROVANTE do "Boleto e comprovante"). Comprovantes sem correspondência
 * única voltam listados com o motivo, para anexar manualmente.
 */
export async function importPaymentReceiptsAction(base64: string): Promise<ImportReceiptsResult> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão.", attached: [], unmatched: [] };
  }
  if (!base64) return { ok: false, error: "Anexe o PDF de comprovantes.", attached: [], unmatched: [] };

  let receipts;
  try {
    const { extractPaymentReceipts } = await import("@/lib/receipts-ai");
    receipts = await extractPaymentReceipts(base64);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível ler os comprovantes.",
      attached: [],
      unmatched: [],
    };
  }
  if (receipts.length === 0) {
    return { ok: false, error: "Nenhum comprovante encontrado no PDF.", attached: [], unmatched: [] };
  }

  const { PDFDocument } = await import("pdf-lib");
  const original = await PDFDocument.load(Buffer.from(base64, "base64"));
  const pageCount = original.getPageCount();

  const attached: { title: string; receipt: string }[] = [];
  const unmatched: { receipt: string; reason: string }[] = [];
  const usedPayables = new Set<string>();

  for (const r of receipts) {
    const label = `${r.descricao || "Comprovante"}${r.valor != null ? ` — ${brl(r.valor)}` : ""}${r.data ? ` (${r.data})` : ""}`;
    if (r.valor == null || r.valor <= 0) {
      unmatched.push({ receipt: label, reason: "valor não identificado no comprovante" });
      continue;
    }
    // Candidatos: títulos de MESMO valor (centavo), sem comprovante ainda —
    // PAGOS (data de pagamento ± 5 dias, quando o comprovante traz data) e
    // também EM ABERTO (pendente/atrasado): o comprovante costuma chegar antes
    // da baixa no sistema.
    const dateMs =
      r.data && !Number.isNaN(Date.parse(`${r.data}T00:00:00Z`))
        ? Date.parse(`${r.data}T00:00:00Z`)
        : null;
    const candidates = await prisma.payable.findMany({
      where: {
        amount: { gte: r.valor - 0.005, lte: r.valor + 0.005 },
        id: { notIn: Array.from(usedPayables) },
        attachments: { none: { kind: "COMPROVANTE" } },
        OR: [
          {
            status: "PAGO",
            ...(dateMs
              ? {
                  paymentDate: {
                    gte: new Date(dateMs - 5 * 86400000),
                    lte: new Date(dateMs + 5 * 86400000),
                  },
                }
              : {}),
          },
          { status: { not: "PAGO" } },
        ],
      },
      select: { id: true, orderNumber: true, description: true, status: true, dueDate: true },
      take: 5,
    });

    // Desempate, sempre sem "chutar": 1 candidato → usa; senão, se houver um
    // único PAGO (a baixa casa com a data do comprovante) → usa; senão, se
    // sobrar um único EM ABERTO com vencimento perto da data do comprovante
    // (± 30 dias — descarta ocorrências de outros meses da mesma recorrência)
    // → usa; qualquer outra combinação volta como "anexe manualmente".
    let pick = candidates;
    if (pick.length > 1) {
      const pagos = pick.filter((c) => c.status === "PAGO");
      if (pagos.length === 1) {
        pick = pagos;
      } else if (dateMs) {
        const near = pick.filter(
          (c) => c.status !== "PAGO" && Math.abs(c.dueDate.getTime() - dateMs) <= 30 * 86400000,
        );
        if (near.length === 1) pick = near;
      }
    }

    if (pick.length === 0) {
      unmatched.push({
        receipt: label,
        reason: "nenhum título (pago ou em aberto) com esse valor e sem comprovante foi encontrado",
      });
      continue;
    }
    if (pick.length > 1) {
      unmatched.push({
        receipt: label,
        reason: `mais de um título com esse valor (${pick
          .map((c) => `nº ${String(c.orderNumber).padStart(4, "0")}`)
          .join(", ")}) — anexe manualmente`,
      });
      continue;
    }

    const target = pick[0];
    // Recorta SÓ a página do comprovante num PDF próprio.
    let pageBytes: Uint8Array;
    if (r.pagina >= 1 && r.pagina <= pageCount) {
      const single = await PDFDocument.create();
      const [page] = await single.copyPages(original, [r.pagina - 1]);
      single.addPage(page);
      pageBytes = await single.save();
    } else {
      pageBytes = new Uint8Array(Buffer.from(base64, "base64")); // página inválida: anexa o PDF inteiro
    }

    await prisma.payableAttachment.create({
      data: {
        payableId: target.id,
        kind: "COMPROVANTE",
        description: "Comprovante de pagamento",
        filename: `comprovante-${String(target.orderNumber).padStart(4, "0")}.pdf`,
        mimeType: "application/pdf",
        size: pageBytes.byteLength,
        data: Buffer.from(pageBytes),
      },
    });
    usedPayables.add(target.id);
    attached.push({
      title: `nº ${String(target.orderNumber).padStart(4, "0")} — ${target.description}${
        target.status !== "PAGO" ? " (título em aberto — falta dar baixa)" : ""
      }`,
      receipt: label,
    });
  }

  revalidatePath("/financeiro/a-pagar");
  return { ok: attached.length > 0, attached, unmatched };
}

export type ImportDuplicatasResult = {
  ok: boolean;
  error?: string;
  created: string[];
  skipped: { title: string; reason: string }[];
};

export type ReadDuplicatasResult = {
  ok: boolean;
  error?: string;
  fornecedorNome?: string | null;
  fornecedorCnpj?: string | null;
  /** Fornecedor do cadastro que casou pelo CNPJ (pré-selecionado na confirmação). */
  suggestedSupplierId?: string | null;
  /** Lista completa de fornecedores para o usuário confirmar/trocar. */
  suppliers?: { id: string; name: string }[];
  duplicatas?: import("@/lib/duplicatas-ai").DuplicataExtraida[];
};

/**
 * ETAPA 1 da importação da relação de duplicatas: a IA lê o PDF e devolve o
 * fornecedor identificado + as parcelas, SEM criar nada. O usuário confirma (ou
 * troca) o fornecedor — que pode estar cadastrado com outro nome (ex.: "PMZ"
 * para Pemaza) — e a etapa 2 (createDuplicatasAction) cria os títulos.
 */
export async function readDuplicatasAction(base64: string): Promise<ReadDuplicatasResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!base64) return { ok: false, error: "Anexe o PDF do relatório." };

  let report;
  try {
    const { extractDuplicatas } = await import("@/lib/duplicatas-ai");
    report = await extractDuplicatas(base64);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível ler o relatório." };
  }
  if (report.duplicatas.length === 0) {
    return { ok: false, error: "Nenhuma duplicata encontrada no relatório." };
  }

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, document: true },
  });
  const cnpj = (report.fornecedorCnpj || "").replace(/\D/g, "");
  // Sugestão: CNPJ exato; senão, mesma RAIZ de CNPJ (8 primeiros dígitos = a
  // mesma empresa, filial diferente — ex.: relatório da filial 0017 e o
  // fornecedor cadastrado com a 0076, caso PMZ/Pemaza).
  const byCnpj = cnpj ? suppliers.find((s) => (s.document || "").replace(/\D/g, "") === cnpj) : null;
  const byRoot =
    !byCnpj && cnpj.length === 14
      ? suppliers.find((s) => (s.document || "").replace(/\D/g, "").slice(0, 8) === cnpj.slice(0, 8))
      : null;

  return {
    ok: true,
    fornecedorNome: report.fornecedorNome,
    fornecedorCnpj: report.fornecedorCnpj,
    suggestedSupplierId: byCnpj?.id ?? byRoot?.id ?? null,
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    duplicatas: report.duplicatas,
  };
}

const dupInputSchema = z.array(
  z.object({
    fatura: z.string().nullable(),
    parcela: z.number().int().nullable(),
    nota: z.string().nullable(),
    serie: z.string().nullable(),
    emissao: z.string().nullable(),
    vencimento: z.string().nullable(),
    valor: z.number().nullable(),
  }),
);

/**
 * ETAPA 2: cria os títulos a pagar PENDENTES das parcelas ainda não lançadas,
 * no fornecedor CONFIRMADO pelo usuário — categoria Compra de peças, nº do
 * documento, vencimento e observações preenchidos. Fica faltando só editar o
 * título para vincular o veículo/peça. `newSupplierName` cadastra um fornecedor
 * novo quando o do relatório não existe; `cnpj` completa o cadastro sem CNPJ.
 */
export async function createDuplicatasAction(input: {
  supplierId?: string | null;
  newSupplierName?: string | null;
  cnpj?: string | null;
  duplicatas: unknown;
}): Promise<ImportDuplicatasResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão.", created: [], skipped: [] };
  }
  const parsedDups = dupInputSchema.safeParse(input.duplicatas);
  if (!parsedDups.success || parsedDups.data.length === 0) {
    return { ok: false, error: "Parcelas inválidas — leia o PDF de novo.", created: [], skipped: [] };
  }
  const report = { duplicatas: parsedDups.data };

  let supplierId = (input.supplierId || "").trim() || null;
  if (!supplierId) {
    const nome = (input.newSupplierName || "").trim();
    if (!nome) return { ok: false, error: "Escolha o fornecedor.", created: [], skipped: [] };
    supplierId = await resolveSupplierByName(nome);
  }
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, document: true },
  });
  if (!supplier) return { ok: false, error: "Fornecedor não encontrado.", created: [], skipped: [] };
  const supplierName = supplier.name;
  if (input.cnpj && !(supplier.document || "").trim()) {
    // Completa o CNPJ no cadastro para a próxima importação casar sozinha.
    await prisma.supplier.update({ where: { id: supplierId }, data: { document: input.cnpj } });
  }

  const digits = (s: string | null) => (s || "").replace(/\D/g, "");
  const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

  // Títulos já lançados, para deduplicar em memória. A busca é GLOBAL (não só o
  // fornecedor escolhido): as NFs podem ter sido lançadas sob OUTRO cadastro do
  // mesmo fornecedor (ex.: "PMZ" × "Pemaza") — deduplicar só pelo fornecedor
  // deixava passar duplicatas. Traz os títulos do fornecedor + qualquer título
  // cujo documento contenha o nº de uma das NFs + títulos com os mesmos valores.
  const notas = Array.from(
    new Set(report.duplicatas.map((d) => digits(d.nota)).filter((n) => n.length >= 4)),
  );
  const valores = Array.from(
    new Set(report.duplicatas.filter((d) => d.valor != null && d.valor > 0).map((d) => d.valor as number)),
  );
  const existing = await prisma.payable.findMany({
    where: {
      OR: [
        { supplierId },
        ...notas.map((n) => ({ documentNumber: { contains: n } })),
        ...(valores.length ? [{ amount: { in: valores } }] : []),
      ],
    },
    select: { orderNumber: true, documentNumber: true, amount: true, dueDate: true, supplierId: true },
  });

  // Total de parcelas por fatura (para a descrição "parc. 1/2").
  const parcelasPorFatura = new Map<string, number>();
  for (const dup of report.duplicatas) {
    if (dup.fatura) parcelasPorFatura.set(dup.fatura, (parcelasPorFatura.get(dup.fatura) ?? 0) + 1);
  }

  const created: string[] = [];
  const skipped: { title: string; reason: string }[] = [];

  for (const dup of report.duplicatas) {
    const parcela = dup.parcela ?? 1;
    const totalParc = dup.fatura ? parcelasPorFatura.get(dup.fatura) ?? 1 : 1;
    const docNum = `NF ${dup.nota ?? dup.fatura ?? "?"} parc. ${parcela}`;
    const title = `${docNum}${totalParc > 1 ? `/${totalParc}` : ""}${dup.valor != null ? ` — ${brl(dup.valor)}` : ""}${dup.vencimento ? ` (venc. ${dup.vencimento})` : ""}`;

    if (dup.valor == null || dup.valor <= 0 || !dup.vencimento || Number.isNaN(Date.parse(`${dup.vencimento}T00:00:00Z`))) {
      skipped.push({ title, reason: "valor ou vencimento não identificados" });
      continue;
    }
    const due = new Date(`${dup.vencimento}T12:00:00Z`);
    const notaDigits = digits(dup.nota);

    // Duplicata já lançada? Mesmo VALOR e: documento com o nº da NF (qualquer
    // fornecedor) OU mesmo vencimento no fornecedor escolhido. Preferência para
    // o vencimento igual (desempata parcelas de mesmo valor da mesma NF) e cada
    // título existente é CONSUMIDO — deduplica no máximo uma parcela, para a
    // parcela 2/2 nova não ser pulada por causa da 1/2 já lançada.
    const sameAmount = (p: (typeof existing)[number]) => Math.abs(p.amount - dup.valor!) <= 0.005;
    const docMatch = (p: (typeof existing)[number]) =>
      p.documentNumber === docNum ||
      (notaDigits.length >= 4 && digits(p.documentNumber).includes(notaDigits));
    const candidates = existing.filter(
      (p) => sameAmount(p) && (docMatch(p) || (p.supplierId === supplierId && sameDay(p.dueDate, due))),
    );
    const match =
      candidates.find((p) => docMatch(p) && sameDay(p.dueDate, due)) ??
      candidates.find(docMatch) ??
      candidates[0];
    if (match) {
      existing.splice(existing.indexOf(match), 1);
      skipped.push({
        title,
        reason: `já lançada (título nº ${String(match.orderNumber).padStart(4, "0")})`,
      });
      continue;
    }

    const payable = await createManualPayable({
      description: `Peças ${supplierName} - NF ${dup.nota ?? dup.fatura ?? ""} (parc. ${parcela}${totalParc > 1 ? `/${totalParc}` : ""})`,
      category: "COMPRA_PECA",
      categoryLabel: "Compra de peças",
      documentNumber: docNum,
      amount: dup.valor,
      dueDate: due,
      supplierId,
      structuralKey: "ADMINISTRATIVO",
      notes: [
        dup.fatura ? `Fatura ${dup.fatura}` : null,
        dup.serie ? `série ${dup.serie}` : null,
        dup.emissao ? `emissão ${dup.emissao}` : null,
        "importado da relação de duplicatas — vincule o veículo/peça",
      ]
        .filter(Boolean)
        .join(" · "),
      alreadyPaid: false,
    });
    // Entra no dedup para o caso de o mesmo PDF trazer a parcela duplicada.
    existing.push({ orderNumber: payable.orderNumber, documentNumber: docNum, amount: dup.valor, dueDate: due, supplierId });
    created.push(`nº ${String(payable.orderNumber).padStart(4, "0")} — ${title}`);
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
  return { ok: created.length > 0, created, skipped };
}

export type ImportNfeResult = {
  ok: boolean;
  error?: string;
  /** Um item por parcela da NF: o que aconteceu com cada uma. */
  outcomes: string[];
};

/** Uma parcela da nota e o que vai acontecer com ela quando for confirmada. */
export type NfeParcelaPlano = {
  parcela: number;
  total: number;
  valor: number;
  vencimento: string;
  /** CRIAR = título novo; ANEXAR = a nota entra num título que já existe. */
  acao: "CRIAR" | "ANEXAR";
  /** Nº do título já lançado, quando a ação é ANEXAR. */
  tituloExistente: string | null;
};

/** Uma nota do PDF, já lida e conferida contra o que existe no financeiro. */
export type NfeNotaPlano = {
  numero: string;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  emitidaEm: string | null;
  paginaInicial: number | null;
  paginaFinal: number | null;
  itensResumo: string;
  /** Fornecedor já cadastrado que casou pelo CNPJ (null = vai ser cadastrado). */
  supplierId: string | null;
  supplierNome: string;
  parcelas: NfeParcelaPlano[];
};

export type ReadNfeResult = {
  ok: boolean;
  error?: string;
  notas?: NfeNotaPlano[];
  /** Notas que não dá para lançar (sem número, sem valor…), com o motivo. */
  avisos?: string[];
  /** Cadastro de fornecedores, para o usuário trocar o escolhido na revisão. */
  suppliers?: { id: string; name: string }[];
};

/** O que o usuário confirmou na revisão. */
export type ApplyNfePayload = {
  base64: string;
  filename: string;
  /** Quantas notas o PDF tinha (define se o anexo é a página da nota ou o PDF inteiro). */
  totalNotas: number;
  notas: {
    numero: string;
    emitenteNome: string | null;
    emitidaEm: string | null;
    paginaInicial: number | null;
    paginaFinal: number | null;
    itensResumo: string;
    /** Fornecedor escolhido na revisão; sem ele, `newSupplierName` é cadastrado. */
    supplierId: string | null;
    newSupplierName: string | null;
    parcelas: { parcela: number; total: number; valor: number; vencimento: string }[];
  }[];
};

const soDigitos = (s: string | null) => (s || "").replace(/\D/g, "");
const mesmoDiaUTC = (a: Date, b: Date) =>
  a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/**
 * Casa as parcelas de uma nota com títulos JÁ LANÇADOS — as mesmas regras da
 * relação de duplicatas (mesmo valor e, além disso, nº do documento parecido ou
 * mesmo fornecedor vencendo no mesmo dia).
 *
 * É consulta pura: serve tanto para MOSTRAR o plano na revisão quanto para
 * aplicá-lo depois. Como o mesmo código roda nas duas vezes, o que o usuário lê
 * na tela é o que vai acontecer.
 */
async function casarParcelasDaNfe(
  numero: string,
  supplierId: string | null,
  parcelas: { valor: number; vencimento: string; parcela: number; total: number }[],
) {
  const candidatos = await prisma.payable.findMany({
    where: {
      OR: [
        ...(supplierId ? [{ supplierId }] : []),
        { documentNumber: { contains: numero } },
        { amount: { in: parcelas.map((p) => p.valor) } },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      documentNumber: true,
      amount: true,
      dueDate: true,
      supplierId: true,
      notes: true,
    },
  });
  // Um título só pode casar com UMA parcela: o que já foi usado sai da lista.
  const disponiveis = [...candidatos];

  return parcelas.map((parc) => {
    const due = new Date(`${parc.vencimento}T12:00:00Z`);
    const docNum = `NF ${numero} parc. ${parc.parcela}`;
    const mesmoValor = (p: (typeof candidatos)[number]) => Math.abs(p.amount - parc.valor) <= 0.005;
    const mesmoDoc = (p: (typeof candidatos)[number]) =>
      p.documentNumber === docNum ||
      soDigitos(p.documentNumber).replace(/^0+/, "").includes(numero);
    const possiveis = disponiveis.filter(
      (p) =>
        mesmoValor(p) &&
        (mesmoDoc(p) || (supplierId != null && p.supplierId === supplierId && mesmoDiaUTC(p.dueDate, due))),
    );
    const match =
      possiveis.find((p) => mesmoDoc(p) && mesmoDiaUTC(p.dueDate, due)) ??
      possiveis.find(mesmoDoc) ??
      possiveis[0];
    if (match) disponiveis.splice(disponiveis.indexOf(match), 1);
    return { parc, due, docNum, match: match ?? null };
  });
}

/** Resumo dos itens da nota, usado na descrição e nas observações do título. */
function resumoDosItens(itens: { descricao: string; quantidade: number | null }[]): string {
  return itens
    .filter((i) => i.descricao.trim())
    .map(
      (i) =>
        `${i.descricao.trim()}${i.quantidade != null && i.quantidade > 1 ? ` (x${i.quantidade})` : ""}`,
    )
    .join(", ");
}

/**
 * ETAPA 1 de "Importar NFs do fornecedor": a IA lê o PDF (uma ou várias DANFEs)
 * e devolve o PLANO — fornecedor identificado, itens e, parcela a parcela, se o
 * título seria criado ou se a nota seria anexada a um título já lançado.
 *
 * Nada é gravado aqui. O lançamento só acontece em `applyNfeAction`, depois do
 * usuário conferir na tela: importar era criar título direto, sem revisão, e
 * um número errado da IA entrava no financeiro sem ninguém ver.
 */
export async function readNfeAction(base64: string): Promise<ReadNfeResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!base64) return { ok: false, error: "Anexe o PDF da NF-e." };

  let notas;
  try {
    const { extractNfeLote } = await import("@/lib/nfe-ai");
    notas = await extractNfeLote(base64);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível ler a NF-e." };
  }
  if (notas.length === 0) return { ok: false, error: "Nenhuma NF-e encontrada no PDF." };

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, document: true },
  });

  const plano: NfeNotaPlano[] = [];
  const avisos: string[] = [];

  for (const nfe of notas) {
    const numero = soDigitos(nfe.numero).replace(/^0+/, "");
    if (!numero) {
      avisos.push("Uma das notas está sem número identificado — não dá para lançar.");
      continue;
    }

    // Fornecedor: CNPJ exato → mesma raiz (outra filial) → nenhum (cadastra depois).
    const cnpj = soDigitos(nfe.emitenteCnpj);
    const cadastrado =
      (cnpj ? suppliers.find((s) => soDigitos(s.document) === cnpj) : undefined) ??
      (cnpj.length === 14
        ? suppliers.find(
            (s) =>
              soDigitos(s.document).slice(0, 8) === cnpj.slice(0, 8) &&
              soDigitos(s.document).length === 14,
          )
        : undefined) ??
      null;

    const parcelasNfe = nfe.duplicatas.filter(
      (d) =>
        d.valor != null &&
        d.valor > 0 &&
        d.vencimento &&
        !Number.isNaN(Date.parse(`${d.vencimento}T00:00:00Z`)),
    );
    const bruto =
      parcelasNfe.length > 0
        ? parcelasNfe.map((d) => ({ vencimento: d.vencimento as string, valor: d.valor as number }))
        : nfe.valorTotal != null && nfe.valorTotal > 0
          ? [
              {
                vencimento: nfe.emitidaEm || new Date().toISOString().slice(0, 10),
                valor: nfe.valorTotal,
              },
            ]
          : [];
    if (bruto.length === 0) {
      avisos.push(`NF ${numero}: valor/vencimento não identificados — não dá para lançar.`);
      continue;
    }

    const parcelas = bruto.map((b, i) => ({ ...b, parcela: i + 1, total: bruto.length }));
    const casadas = await casarParcelasDaNfe(numero, cadastrado?.id ?? null, parcelas);

    plano.push({
      numero,
      emitenteNome: nfe.emitenteNome,
      emitenteCnpj: nfe.emitenteCnpj,
      emitidaEm: nfe.emitidaEm,
      paginaInicial: nfe.paginaInicial,
      paginaFinal: nfe.paginaFinal,
      itensResumo: resumoDosItens(nfe.itens),
      supplierId: cadastrado?.id ?? null,
      supplierNome:
        cadastrado?.name ?? ((nfe.emitenteNome || "").trim() || "Fornecedor não identificado"),
      parcelas: casadas.map(({ parc, match }) => ({
        parcela: parc.parcela,
        total: parc.total,
        valor: parc.valor,
        vencimento: parc.vencimento,
        acao: match ? ("ANEXAR" as const) : ("CRIAR" as const),
        tituloExistente: match ? String(match.orderNumber).padStart(4, "0") : null,
      })),
    });
  }

  if (plano.length === 0) {
    return { ok: false, error: avisos[0] || "Nenhuma nota utilizável no PDF." };
  }
  return {
    ok: true,
    notas: plano,
    avisos,
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
  };
}

/**
 * ETAPA 2: cria/anexa SÓ o que o usuário marcou na revisão. A conferência
 * contra o que já existe é refeita aqui (e não herdada da tela), para o caso de
 * alguém ter lançado o mesmo título enquanto a revisão estava aberta.
 */
export async function applyNfeAction(payload: ApplyNfePayload): Promise<ImportNfeResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão.", outcomes: [] };
  }
  const notas = (payload?.notas ?? []).filter((n) => n.parcelas.length > 0);
  if (!payload?.base64 || notas.length === 0) {
    return { ok: false, error: "Marque ao menos uma parcela para lançar.", outcomes: [] };
  }

  const { PDFDocument } = await import("pdf-lib");
  const fullBytes = Buffer.from(payload.base64, "base64");
  const original = await PDFDocument.load(fullBytes);
  const pageCount = original.getPageCount();
  const outcomes: string[] = [];

  for (const nota of notas) {
    const numero = soDigitos(nota.numero).replace(/^0+/, "");
    if (!numero) continue;

    // Fornecedor: o escolhido na revisão; se o usuário optou por cadastrar, é
    // agora que o cadastro nasce (nunca na leitura).
    let supplierId = nota.supplierId;
    let supplierNome = "";
    if (supplierId) {
      const s = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true },
      });
      if (!s) {
        outcomes.push(`NF ${numero}: fornecedor escolhido não existe mais — pulada.`);
        continue;
      }
      supplierNome = s.name;
    } else {
      const nome = (nota.newSupplierName || nota.emitenteNome || "").trim();
      if (!nome) {
        outcomes.push(`NF ${numero}: fornecedor não identificado — pulada.`);
        continue;
      }
      supplierId = await resolveSupplierByName(nome);
      supplierNome = nome;
    }

    // Recorta as páginas DESTA nota (PDF com várias DANFEs); com uma nota só, ou
    // intervalo inválido, o anexo é o PDF inteiro.
    let notaBytes: Buffer = fullBytes;
    if (
      payload.totalNotas > 1 &&
      nota.paginaInicial != null &&
      nota.paginaFinal != null &&
      nota.paginaInicial >= 1 &&
      nota.paginaFinal >= nota.paginaInicial &&
      nota.paginaFinal <= pageCount
    ) {
      const single = await PDFDocument.create();
      const idxs = Array.from(
        { length: nota.paginaFinal - nota.paginaInicial + 1 },
        (_, k) => (nota.paginaInicial as number) - 1 + k,
      );
      const pages = await single.copyPages(original, idxs);
      for (const pg of pages) single.addPage(pg);
      notaBytes = Buffer.from(await single.save());
    }

    const anexarNfe = async (payableId: string) => {
      const already = await prisma.payableAttachment.findFirst({
        where: { payableId, description: `NF-e ${numero}` },
        select: { id: true },
      });
      if (already) return;
      await prisma.payableAttachment.create({
        data: {
          payableId,
          kind: "OUTRO",
          description: `NF-e ${numero}`,
          filename:
            payload.totalNotas > 1
              ? `nfe-${numero}.pdf`
              : payload.filename || `nfe-${numero}.pdf`,
          mimeType: "application/pdf",
          size: notaBytes.byteLength,
          data: new Uint8Array(notaBytes),
        },
      });
    };

    const itensResumo = (nota.itensResumo || "").trim();
    const casadas = await casarParcelasDaNfe(numero, supplierId, nota.parcelas);

    for (const { parc, due, docNum, match } of casadas) {
      const label = `NF ${numero} parc. ${parc.parcela}/${parc.total} — ${brl(parc.valor)} (venc. ${parc.vencimento})`;

      if (match) {
        await anexarNfe(match.id);
        // Peças entram nas observações do título existente (sem duplicar).
        if (itensResumo && !(match.notes || "").includes("Itens NF")) {
          await prisma.payable.update({
            where: { id: match.id },
            data: {
              notes: [(match.notes || "").trim() || null, `Itens NF ${numero}: ${itensResumo}`]
                .filter(Boolean)
                .join(" · "),
            },
          });
        }
        outcomes.push(
          `${label} → NF anexada ao título nº ${String(match.orderNumber).padStart(4, "0")} (já lançado)`,
        );
        continue;
      }

      const payable = await createManualPayable({
        description: `Peças ${supplierNome} - NF ${numero}${parc.total > 1 ? ` (parc. ${parc.parcela}/${parc.total})` : ""}${itensResumo ? ` — ${itensResumo.slice(0, 120)}` : ""}`,
        category: "COMPRA_PECA",
        categoryLabel: "Compra de peças",
        documentNumber: docNum,
        amount: parc.valor,
        dueDate: due,
        supplierId,
        structuralKey: "ADMINISTRATIVO",
        notes: [
          itensResumo ? `Itens NF ${numero}: ${itensResumo}` : null,
          nota.emitidaEm ? `emissão ${nota.emitidaEm}` : null,
          "importado da NF-e — vincule o veículo",
        ]
          .filter(Boolean)
          .join(" · "),
        alreadyPaid: false,
      });
      await anexarNfe(payable.id);
      outcomes.push(
        `${label} → título nº ${String(payable.orderNumber).padStart(4, "0")} criado (com as peças)`,
      );
    }
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
  return { ok: true, outcomes };
}

// ---------------------------------------------------------------------------
// Anexos do título (nota fiscal, comprovante…)
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type AttachmentState = { error?: string; ok?: boolean };

const ATTACHMENT_KINDS = ["BOLETO", "COMPROVANTE", "OUTRO"] as const;
const KIND_DEFAULT_DESC: Record<string, string> = {
  BOLETO: "Boleto de pagamento",
  COMPROVANTE: "Comprovante de pagamento",
};

export async function uploadPayableAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const payableId = String(formData.get("payableId") || "").trim();
  const kindRaw = String(formData.get("kind") || "OUTRO").trim().toUpperCase();
  const kind = (ATTACHMENT_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "OUTRO";
  const description =
    String(formData.get("description") || "").trim() || KIND_DEFAULT_DESC[kind] || "Nota fiscal";
  const file = formData.get("file");
  if (!payableId) return { error: "Título inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Arquivo muito grande (máximo 15 MB)." };

  const payable = await prisma.payable.findUnique({ where: { id: payableId }, select: { id: true } });
  if (!payable) return { error: "Título não encontrado." };

  // Boleto e comprovante são um por título: substitui o que já houver do tipo.
  if (kind === "BOLETO" || kind === "COMPROVANTE") {
    await prisma.payableAttachment.deleteMany({ where: { payableId, kind } });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  await prisma.payableAttachment.create({
    data: {
      payableId,
      kind,
      description,
      filename: file.name || "anexo",
      mimeType: file.type || "application/octet-stream",
      size: data.byteLength,
      data,
    },
  });
  revalidatePath("/financeiro/a-pagar");
  revalidatePath(`/financeiro/a-pagar/${payableId}/ordem`);
  revalidatePath(`/financeiro/a-pagar/${payableId}/editar`);
  return { ok: true };
}

export async function deletePayableAttachmentAction(id: string, payableId: string) {
  await assertCanAny([
    ["financeiro", "criar"],
    ["financeiro", "editar"],
  ]);
  await prisma.payableAttachment.delete({ where: { id } });
  revalidatePath("/financeiro/a-pagar");
  revalidatePath(`/financeiro/a-pagar/${payableId}/ordem`);
  revalidatePath(`/financeiro/a-pagar/${payableId}/editar`);
}

// ---------------------------------------------------------------------------
// Leitura do boleto do título com IA
// ---------------------------------------------------------------------------

/** Um boleto lido do arquivo, já pronto para a tela. */
export type BoletoLido = {
  /** Valor a pagar até o vencimento (já resolvido o caso do desconto). */
  amount: number | null;
  /** yyyy-mm-dd, quando a IA conseguiu ler. */
  dueDate: string | null;
  descricao: string | null;
  cedente: string | null;
};

export type ReadBoletoResult = {
  ok: boolean;
  error?: string;
  /** O arquivo foi anexado como BOLETO mesmo que a leitura falhe. */
  attached: boolean;
  boletos: BoletoLido[];
  /** Vazio = o valor pode ser aplicado; com texto = por que não pode. */
  amountLocked?: string;
  /** Idem para o vencimento (título de recorrência manda na data). */
  dueDateLocked?: string;
};

/**
 * Por que o valor/vencimento deste título não pode vir do boleto. O motor de
 * edição (`updatePayableAction`) já trava esses casos; aqui a trava é a mesma,
 * só que explicada antes de o usuário clicar.
 */
function boletoLocks(p: {
  cardInvoice: boolean;
  category: CategoriaPagar;
  description: string;
  saleId: string | null;
  recurringId: string | null;
}): { amountLocked?: string; dueDateLocked?: string } {
  const repasseDebito =
    isVehiclePurchase(p.category) &&
    !p.saleId &&
    (p.description.startsWith("Débitos do veículo") ||
      p.description.startsWith("Quitação do financiamento"));
  const amountLocked = p.cardInvoice
    ? "O valor da fatura é a soma dos lançamentos — importe a fatura em PDF no bloco do cartão."
    : isVehiclePurchase(p.category) && !repasseDebito
      ? "O valor da compra do veículo vem da ficha dele — altere no Estoque."
      : undefined;
  const dueDateLocked = p.recurringId
    ? "O vencimento vem da recorrência — mudar aqui faria nascer um título repetido."
    : undefined;
  return { amountLocked, dueDateLocked };
}

/**
 * Anexa o boleto do título (substituindo o anterior, como o slot manual) e o lê
 * com a IA, devolvendo valor e vencimento para o usuário conferir e aplicar.
 * A leitura roda DEPOIS do anexo e nunca o derruba: falhou a IA, o boleto
 * continua anexado e o preenchimento é manual.
 */
export async function readPayableBoletoAction(formData: FormData): Promise<ReadBoletoResult> {
  const vazio = { attached: false, boletos: [] as BoletoLido[] };
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, ...vazio, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const payableId = String(formData.get("payableId") || "").trim();
  const file = formData.get("file");
  if (!payableId) return { ok: false, ...vazio, error: "Título inválido." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, ...vazio, error: "Selecione o arquivo do boleto." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, ...vazio, error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    select: {
      id: true,
      status: true,
      cardInvoice: true,
      category: true,
      description: true,
      saleId: true,
      recurringId: true,
    },
  });
  if (!payable) return { ok: false, ...vazio, error: "Título não encontrado." };
  if (payable.status === "PAGO") {
    return { ok: false, ...vazio, error: "Título já pago. Reverta antes de mexer nele." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  await prisma.payableAttachment.deleteMany({ where: { payableId, kind: "BOLETO" } });
  await prisma.payableAttachment.create({
    data: {
      payableId,
      kind: "BOLETO",
      description: KIND_DEFAULT_DESC.BOLETO,
      filename: file.name || "boleto",
      mimeType,
      size: buffer.byteLength,
      data: buffer,
    },
  });
  revalidatePath(`/financeiro/a-pagar/${payableId}/editar`);
  revalidatePath(`/financeiro/a-pagar/${payableId}/ordem`);

  const locks = boletoLocks(payable);
  try {
    const { extractBoletos } = await import("@/lib/boleto-ai");
    const lidos = await extractBoletos(buffer.toString("base64"), mimeType);
    const boletos: BoletoLido[] = lidos.map((b) => {
      const valor = b.valor && b.valor > 0 ? round2(b.valor) : null;
      // Fora da multa de trânsito não existe desconto por pontualidade: se a
      // leitura trouxer um valor "com desconto", vale o valor cheio.
      const amount =
        valor != null && b.tipo !== "MULTA" && b.valorSemDesconto && b.valorSemDesconto > valor
          ? round2(b.valorSemDesconto)
          : valor;
      return {
        amount,
        dueDate: b.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(b.vencimento) ? b.vencimento : null,
        descricao: b.descricao,
        cedente: b.cedente,
      };
    });
    if (!boletos.length) {
      return {
        ok: false,
        attached: true,
        boletos: [],
        error: "Nenhum boleto foi reconhecido neste arquivo — ele ficou anexado assim mesmo.",
        ...locks,
      };
    }
    return { ok: true, attached: true, boletos, ...locks };
  } catch (e) {
    return {
      ok: false,
      attached: true,
      boletos: [],
      error: `${e instanceof Error ? e.message : "Não foi possível ler o boleto."} O arquivo ficou anexado — preencha à mão.`,
      ...locks,
    };
  }
}

/**
 * Aplica ao título o valor e/ou o vencimento lidos do boleto. Passa pelo mesmo
 * `updateManualPayable` da edição manual (mantém o custo do veículo espelhado)
 * e repete as travas de `boletoLocks` no servidor — a tela só esconde o botão.
 */
export async function applyBoletoToPayableAction(input: {
  payableId: string;
  amount?: number | null;
  dueDate?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const current = await prisma.payable.findUnique({
    where: { id: input.payableId },
    select: {
      id: true,
      status: true,
      cardInvoice: true,
      category: true,
      categoryLabel: true,
      description: true,
      documentNumber: true,
      amount: true,
      dueDate: true,
      supplierId: true,
      notes: true,
      saleId: true,
      recurringId: true,
      vehicleId: true,
      capitalBeneficiaryId: true,
      costCenter: { select: { key: true } },
    },
  });
  if (!current) return { ok: false, error: "Título não encontrado." };
  if (current.status === "PAGO") return { ok: false, error: "Título já pago. Reverta antes de editar." };

  const locks = boletoLocks(current);
  const amount =
    input.amount != null && input.amount > 0 && !locks.amountLocked ? round2(input.amount) : null;
  const dueDate =
    input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) && !locks.dueDateLocked
      ? parseDateInput(input.dueDate)
      : null;
  if (amount == null && dueDate == null) {
    return { ok: false, error: locks.amountLocked || locks.dueDateLocked || "Nada a aplicar." };
  }

  const flow = current.vehicleId
    ? "VEICULOS"
    : current.capitalBeneficiaryId
      ? "CAPITAL"
      : isStructuralKey(current.costCenter?.key)
        ? current.costCenter.key
        : "ADMINISTRATIVO";

  await updateManualPayable({
    id: current.id,
    description: current.description,
    category: current.category,
    categoryLabel: current.categoryLabel,
    documentNumber: current.documentNumber,
    amount: amount ?? current.amount,
    dueDate: dueDate ?? current.dueDate,
    supplierId: current.supplierId,
    notes: current.notes,
    structuralKey: flow,
    vehicleId: current.vehicleId,
    capitalBeneficiaryId: current.capitalBeneficiaryId,
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath(`/financeiro/a-pagar/${current.id}/editar`);
  revalidatePath(`/financeiro/a-pagar/${current.id}/ordem`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// NF de devolução: abater a mercadoria devolvida do título da compra
// ---------------------------------------------------------------------------

export type DevolucaoResult = {
  ok: boolean;
  error?: string;
  /** O que foi lido e aplicado, pronto para a tela. */
  nfNumero?: string;
  valor?: number;
  valorAntes?: number;
  valorDepois?: number;
};

/**
 * Lê a NF-e de DEVOLUÇÃO anexada (o fornecedor recebendo a mercadoria de
 * volta) e abate o valor dela do título da compra: a ordem de pagamento passa
 * a valer o que sobrou para pagar. Ex.: título de 293,80, devolução de 30,60,
 * ordem vai a 263,20.
 *
 * Leitura determinística (sem IA): chave de acesso validada pelo dígito
 * verificador, "VALOR TOTAL DA NOTA" e a natureza da operação vêm da camada de
 * texto do próprio PDF. Conferências antes de mexer em dinheiro:
 *  - precisa ser DEVOLUÇÃO (natureza da operação) — nota comum é recusada;
 *  - o emitente da chave precisa ser o fornecedor do título (CNPJ);
 *  - o valor precisa caber no título (não zera nem deixa negativo);
 *  - a mesma NF não abate duas vezes (a chave fica registrada no anexo).
 *
 * O abatimento passa por updateManualPayable — o mesmo caminho da edição
 * manual —, então o custo espelhado no veículo acompanha sozinho.
 */
export async function applyReturnNfeAction(formData: FormData): Promise<DevolucaoResult> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const payableId = String(formData.get("payableId") || "").trim();
  const file = formData.get("file");
  if (!payableId) return { ok: false, error: "Título inválido." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione o PDF da NF de devolução." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Arquivo muito grande (máximo 15 MB)." };
  if ((file.type || "") !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
    return { ok: false, error: "Anexe o PDF da NF-e (DANFE) — outros formatos não têm a camada de texto." };
  }

  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    include: { supplier: { select: { name: true, document: true } }, costCenter: { select: { key: true } } },
  });
  if (!payable) return { ok: false, error: "Título não encontrado." };
  if (payable.status === "PAGO") {
    return { ok: false, error: "Título já pago. Reverta a baixa antes de abater a devolução." };
  }
  if (payable.paymentComboId) {
    return { ok: false, error: "Este título está num combo de pagamento — remova-o do combo antes de abater." };
  }
  const locks = boletoLocks(payable);
  if (locks.amountLocked) return { ok: false, error: locks.amountLocked };

  // ---------- leitura do PDF ----------
  const buffer = Buffer.from(await file.arrayBuffer());
  const { textoDoPdf, chavesNfeNoTexto } = await import("@/lib/pdf-text");
  const { dadosDaChaveNfe } = await import("@/lib/renave");
  let texto = "";
  try {
    texto = textoDoPdf(buffer);
  } catch {
    /* tratado abaixo */
  }
  const limpo = texto.replace(/\s+/g, " ");
  if (!limpo) {
    return { ok: false, error: "Não deu para ler o texto deste PDF. Confira se é o DANFE original (não uma foto)." };
  }

  const chaves = chavesNfeNoTexto(texto);
  if (chaves.length === 0) {
    return { ok: false, error: "Não encontrei a chave de acesso (44 dígitos) neste arquivo." };
  }
  const chave = chaves[0];

  if (!/DEVOLU/i.test(limpo)) {
    return {
      ok: false,
      error:
        "Esta NF-e não parece ser de DEVOLUÇÃO (a natureza da operação não diz isso). O abatimento só vale para mercadoria devolvida.",
    };
  }

  // Valor total da nota, no rótulo padrão do DANFE.
  const mValor = limpo.match(/VALOR TOTAL DA NOTA\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const valor = mValor ? Number(mValor[1].replace(/\./g, "").replace(",", ".")) : 0;
  if (!valor || valor <= 0) {
    return { ok: false, error: "Não deu para ler o VALOR TOTAL DA NOTA no DANFE." };
  }

  // O emitente da devolução tem de ser o fornecedor do título (o CNPJ mora na
  // própria chave, posições 7–20).
  const cnpjChave = chave.slice(6, 20);
  const cnpjFornecedor = (payable.supplier?.document || "").replace(/\D/g, "");
  if (cnpjFornecedor && cnpjFornecedor.length === 14 && cnpjFornecedor !== cnpjChave) {
    return {
      ok: false,
      error: `A NF é do CNPJ ${cnpjChave}, mas o fornecedor do título (${payable.supplier?.name ?? "?"}) tem outro CNPJ — confira se anexou a nota certa.`,
    };
  }

  // A mesma devolução não abate duas vezes: a chave fica gravada no anexo.
  const jaAbatida = await prisma.payableAttachment.findFirst({
    where: { payableId, description: { contains: chave } },
    select: { id: true },
  });
  if (jaAbatida) return { ok: false, error: "Esta NF de devolução já foi abatida deste título." };

  const restante = round2(payable.amount - valor);
  if (restante <= 0.005) {
    return {
      ok: false,
      error: `A devolução (${brl(valor)}) cobre o título inteiro (${brl(payable.amount)}). Nesse caso, exclua o título em vez de abater.`,
    };
  }

  const numeroNf = dadosDaChaveNfe(chave)?.numero ?? "?";
  const flow = payable.vehicleId
    ? "VEICULOS"
    : payable.capitalBeneficiaryId
      ? "CAPITAL"
      : isStructuralKey(payable.costCenter?.key)
        ? payable.costCenter.key
        : "ADMINISTRATIVO";

  // Mesmo caminho da edição manual: o custo espelhado do veículo acompanha.
  await updateManualPayable({
    id: payable.id,
    description: payable.description,
    category: payable.category,
    categoryLabel: payable.categoryLabel,
    documentNumber: payable.documentNumber,
    amount: restante,
    dueDate: payable.dueDate,
    supplierId: payable.supplierId,
    notes: [
      payable.notes,
      `Devolução NF ${numeroNf}: ${brl(valor)} abatidos (era ${brl(payable.amount)}).`,
    ]
      .filter(Boolean)
      .join(" · "),
    structuralKey: flow,
    vehicleId: payable.vehicleId,
    capitalBeneficiaryId: payable.capitalBeneficiaryId,
  });

  await prisma.payableAttachment.create({
    data: {
      payableId,
      kind: "OUTRO",
      description: `NF de devolução nº ${numeroNf} — ${brl(valor)} abatidos (chave ${chave})`,
      filename: file.name || "nf-devolucao.pdf",
      mimeType: "application/pdf",
      size: buffer.byteLength,
      data: buffer,
    },
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath(`/financeiro/a-pagar/${payableId}/editar`);
  revalidatePath(`/financeiro/a-pagar/${payableId}/ordem`);
  revalidatePath("/estoque");
  return {
    ok: true,
    nfNumero: numeroNf,
    valor,
    valorAntes: payable.amount,
    valorDepois: restante,
  };
}
