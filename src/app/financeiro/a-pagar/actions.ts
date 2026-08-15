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
import { isStructuralKey } from "@/lib/structural-flows";
import { getNeutralAccountId } from "@/lib/accounts";
import { resolveDespesaCategory } from "@/lib/categories";
import { parseDebtItems, AJUSTE_DEBITOS_DESC, AJUSTE_QUITACAO_DESC } from "@/lib/vehicle-debts";
import { appliedOf, freeCapitalOf } from "@/lib/investments";

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
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
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
    // fechado. O caixa aberto só é exigido quando "já foi pago" (baixa junto).
    if (d.paymentMode === "A_VISTA" && d.alreadyPaid) await assertCashboxOpen();
    await assertMonthOpen(parseDateInput(d.dueDate));
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
  // Veículo é permitido excluir (remove o custo do veículo junto). Recorrência/
  // consórcio se regeneram; venda/peça/espelho têm origem própria.
  if (p.partId || p.recurringId || p.consortiumId || p.employeeId || p.saleId || p.purchaseRequestId) {
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
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
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
    select: { id: true, ...ORIGIN_SELECT },
  });
  const okIds = rows.filter((p) => !originBlockReason(p)).map((p) => p.id);
  const deleted = okIds.length;
  const skipped = ids.length - deleted;

  if (okIds.length) {
    await prisma.$transaction([
      // O custo do veículo perderia o vínculo (SetNull) e a movimentação de
      // capital não tem cascade — os dois saem junto com o título. A troca de
      // fatia aplicada (substituição) também é vinculada ao título.
      prisma.vehicleCost.deleteMany({ where: { payableId: { in: okIds } } }),
      prisma.capitalTransaction.deleteMany({ where: { payableId: { in: okIds } } }),
      prisma.investmentAllocation.deleteMany({ where: { payableId: { in: okIds } } }),
      prisma.payable.deleteMany({ where: { id: { in: okIds } } }),
    ]);
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: deleted > 0, deleted, skipped };
}

// ---------------------------------------------------------------------------
// Anexos do título (nota fiscal, comprovante…)
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type AttachmentState = { error?: string; ok?: boolean };

export async function uploadPayableAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const payableId = String(formData.get("payableId") || "").trim();
  const description = String(formData.get("description") || "").trim() || "Nota fiscal";
  const file = formData.get("file");
  if (!payableId) return { error: "Título inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Arquivo muito grande (máximo 15 MB)." };

  const payable = await prisma.payable.findUnique({ where: { id: payableId }, select: { id: true } });
  if (!payable) return { error: "Título não encontrado." };

  const data = new Uint8Array(await file.arrayBuffer());
  await prisma.payableAttachment.create({
    data: {
      payableId,
      description,
      filename: file.name || "anexo",
      mimeType: file.type || "application/octet-stream",
      size: data.byteLength,
      data,
    },
  });
  revalidatePath("/financeiro/a-pagar");
  revalidatePath(`/financeiro/a-pagar/${payableId}/ordem`);
  return { ok: true };
}

export async function deletePayableAttachmentAction(id: string, payableId: string) {
  await assertCan("financeiro", "criar");
  await prisma.payableAttachment.delete({ where: { id } });
  revalidatePath("/financeiro/a-pagar");
  revalidatePath(`/financeiro/a-pagar/${payableId}/ordem`);
}
