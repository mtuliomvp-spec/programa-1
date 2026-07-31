"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markPayablePaid, markPayablePending, createManualPayable, updateManualPayable, resolveSupplierByName, splitInstallments, addMonths, addDays } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { structuralCenterId } from "@/lib/structural";
import { getNeutralAccountId } from "@/lib/accounts";
import { capitalBalanceOf } from "@/lib/investments";

const round2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Converte texto de valor ("1.234,50" ou "1234.5") em número (ou NaN). */
function parseAmountInput(v: string): number {
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
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

  // Abatimento: paga menos que a comissão → a diferença cobre o saldo devedor
  // do vendedor como APORTE (via Banco Neutro, sem tocar o caixa real).
  if (diff > 0.005 && beneficiary) {
    const abate = diff;
    const capital = await capitalBalanceOf(beneficiary.id);
    const debt = Math.max(0, round2(-capital));
    if (debt <= 0.005) {
      return {
        ok: false,
        error: `${beneficiary.name} não tem saldo devedor de capital a cobrir. Pague a comissão pelo valor cheio.`,
      };
    }
    if (round2(abate - debt) > 0.005) {
      return {
        ok: false,
        error: `Não é possível abater mais que o saldo devedor (${brl(debt)}). O mínimo a pagar ao vendedor é ${brl(round2(comissao - debt))}.`,
      };
    }
    const [capitalCenterId, neutralAccountId] = await Promise.all([
      structuralCenterId("CAPITAL"),
      getNeutralAccountId(),
    ]);
    // Observação explicando, na Ordem de pagamento, por que o título foi pago a
    // menor: a comissão bruta, o quanto foi abatido no capital devedor e o líquido.
    const breakdownNote = `Comissão bruta ${brl(comissao)}. Abatido ${brl(abate)} no saldo de capital devedor de ${beneficiary.name}. Líquido pago ao vendedor ${brl(payout)}.`;
    const liquidoNotes = [payable.notes?.trim() || null, breakdownNote].filter(Boolean).join(" — ");
    await prisma.$transaction(async (tx) => {
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
      // 2) Parte abatida: comissão PAGA no Banco Neutro (não passa pelo caixa real).
      await tx.payable.create({
        data: {
          costCenterId: payable.costCenterId,
          description: `${payable.description} (abatido no saldo de capital)`,
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
      // 3) Aporte do vendedor cobrindo a dívida: Receivable RECEBIDO no Banco
      //    Neutro (centro Capital) + CapitalTransaction APORTE. O par com o
      //    payable acima zera o Banco Neutro; o aporte zera o saldo devedor.
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenterId,
          description: `Aporte p/ abater saldo de capital (comissão) - ${beneficiary!.name}`,
          category: "OUTROS",
          amount: abate,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId: neutralAccountId,
          capitalBeneficiaryId: beneficiary!.id,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: beneficiary!.id,
          kind: "APORTE",
          amount: abate,
          date,
          description: `Abatido do saldo devedor pela ${payable.description}`,
          receivableId: receivable.id,
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

const KNOWN_CATEGORIES: Record<string, "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "OUTROS"> = {
  outros: "OUTROS",
  "despesa operacional": "DESPESA_OPERACIONAL",
  comissão: "COMISSAO",
  comissao: "COMISSAO",
  salário: "SALARIO",
  salario: "SALARIO",
  combustível: "COMBUSTIVEL",
  combustivel: "COMBUSTIVEL",
};

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

  // Toda conta precisa de categoria; e de fornecedor (ou, no Capital, do
  // beneficiário do capital).
  if (!label) return { error: "Informe a categoria." };
  if (isCapital && !d.capitalBeneficiaryId) return { error: "Escolha o beneficiário do capital." };
  if (!supplierName) return { error: "Informe o fornecedor." };

  // Categoria nova é cadastrada para reaproveitar.
  if (!KNOWN_CATEGORIES[label.toLowerCase()]) {
    await prisma.launchCategory.upsert({ where: { name: label }, update: {}, create: { name: label } });
  }

  // Parcelamento: N títulos mensais a partir do 1º vencimento. "Já foi pago"
  // só vale à vista (parcelas futuras nascem pendentes).
  const parcelado = d.paymentMode === "PARCELADO";
  const count = parcelado ? d.installmentsCount : 1;
  if (parcelado && count < 2) return { error: "Informe o número de parcelas (2 ou mais)." };

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // Também no Capital — pode-se pagar a um fornecedor por conta do beneficiário.
  const supplierId = await resolveSupplierByName(supplierName);

  const firstDue = parseDateInput(d.dueDate);
  const amounts = count > 1 ? splitInstallments(d.amount, count) : [d.amount];
  for (let i = 0; i < amounts.length; i++) {
    await createManualPayable({
      description: count > 1 ? `${d.description} - Parcela ${i + 1}/${count}` : d.description,
      category: KNOWN_CATEGORIES[label.toLowerCase()] || "OUTROS",
      categoryLabel: label,
      documentNumber: d.documentNumber?.trim() || null,
      amount: amounts[i],
      dueDate:
        d.installmentPeriod === "DIAS"
          ? addDays(firstDue, i * d.installmentDays)
          : addMonths(firstDue, i),
      supplierId,
      costCenterId: isCapital ? null : d.costCenterId || null,
      structuralKey: d.structuralKey,
      vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
      notes: d.notes || null,
      alreadyPaid: !parcelado && Boolean(d.alreadyPaid),
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
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updatePayableSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const current = await prisma.payable.findUnique({ where: { id: d.id }, select: { status: true } });
  if (!current) return { error: "Título não encontrado." };
  if (current.status === "PAGO") return { error: "Título já pago. Reverta antes de editar." };

  const label = (d.categoryLabel || "").trim();
  if (!label) return { error: "Informe a categoria." };

  const flow = d.structuralKey || "ADMINISTRATIVO";
  const vehicleId = flow === "VEICULOS" ? d.vehicleId || null : null;
  const capitalBeneficiaryId = flow === "CAPITAL" ? d.capitalBeneficiaryId || null : null;
  if (flow === "CAPITAL" && !capitalBeneficiaryId) return { error: "Escolha o beneficiário do capital." };

  if (!KNOWN_CATEGORIES[label.toLowerCase()]) {
    await prisma.launchCategory.upsert({ where: { name: label }, update: {}, create: { name: label } });
  }

  await updateManualPayable({
    id: d.id,
    description: d.description,
    category: KNOWN_CATEGORIES[label.toLowerCase()] || "OUTROS",
    categoryLabel: label,
    documentNumber: d.documentNumber?.trim() || null,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    supplierId: d.supplierId || null,
    notes: d.notes?.trim() || null,
    structuralKey: flow,
    vehicleId,
    capitalBeneficiaryId,
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect("/financeiro/a-pagar");
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

  let deleted = 0;
  let skipped = 0;
  for (const id of ids) {
    const p = await prisma.payable.findUnique({ where: { id }, select: ORIGIN_SELECT });
    if (!p || originBlockReason(p)) {
      skipped += 1;
      continue;
    }
    await prisma.$transaction([
      prisma.vehicleCost.deleteMany({ where: { payableId: id } }),
      prisma.capitalTransaction.deleteMany({ where: { payableId: id } }),
      prisma.payable.delete({ where: { id } }),
    ]);
    deleted += 1;
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
