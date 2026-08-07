"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markReceivableReceived, markReceivablePending, createManualReceivable, updateManualReceivable, receiveReceivable } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertCan, assertCanAny } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { resolveReceitaCategory } from "@/lib/categories";

export async function markReceivedAction(id: string, accountId?: string) {
  await assertCan("financeiro", "receber");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await markReceivableReceived(id, await getCashboxWorkDate(), accountId || null);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

/**
 * Recebe um título total ou parcialmente na conta escolhida. No parcial, o
 * restante continua pendente em Contas a Receber.
 */
export async function receiveAction(id: string, amount: number, accountId?: string) {
  await assertCan("financeiro", "receber");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await receiveReceivable(id, amount, await getCashboxWorkDate(), accountId || null);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
}

export async function markPendingAction(id: string) {
  await assertCan("financeiro", "receber");
  await markReceivablePending(id);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

/**
 * Exclui um título A RECEBER. Espelha o Contas a pagar: bloqueia títulos já
 * RECEBIDOS (reverter antes) e os que vêm de outra operação (venda/peça/
 * recorrência — ajustar na origem). Remove também eventual movimentação de
 * capital vinculada. Excluir um PENDENTE não mexe no caixa.
 */
export async function deleteReceivableAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const r = await prisma.receivable.findUnique({
    where: { id },
    select: { status: true, saleId: true, partSaleId: true, recurringId: true },
  });
  if (!r) return { ok: false, error: "Título não encontrado." };
  if (r.status === "RECEBIDO") {
    return { ok: false, error: "Título já recebido. Use Reverter antes de excluir." };
  }
  if (r.saleId || r.partSaleId || r.recurringId) {
    return { ok: false, error: "Este título vem de outra operação (venda/peça/recorrência). Ajuste na origem." };
  }
  await prisma.$transaction([
    prisma.capitalTransaction.deleteMany({ where: { receivableId: id } }),
    prisma.receivable.delete({ where: { id } }),
  ]);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { ok: true };
}

const manualSchema = z.object({
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  customerId: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  notes: z.string().optional(),
  alreadyReceived: z.coerce.boolean().optional(),
});

export type ManualReceivableState = { error?: string };

export async function createManualReceivableAction(
  _prev: ManualReceivableState,
  formData: FormData,
): Promise<ManualReceivableState> {
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
    // fechado. O caixa aberto só é exigido quando "já recebido" (baixa junto).
    if (d.alreadyReceived) await assertCashboxOpen();
    await assertMonthOpen(parseDateInput(d.dueDate));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }

  await createManualReceivable({
    description: d.description,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    customerId: d.customerId || null,
    costCenterId: d.costCenterId || null,
    structuralKey: d.structuralKey,
    notes: d.notes || null,
    alreadyReceived: Boolean(d.alreadyReceived),
  });

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  redirect("/financeiro/a-receber");
}

// ---------------------------------------------------------------------------
// Editar título a receber (manual e ainda não recebido).
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Informe a descrição"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  customerId: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
});

export type EditReceivableState = { error?: string };

/**
 * Edita um título a receber. Só valem os manuais e ainda não recebidos: os que
 * vêm de venda, venda de peça ou recorrência são ajustados na origem (mexer
 * aqui desalinharia a venda ou faria a recorrência gerar duplicado), e o já
 * recebido movimenta conta/resultado — precisa ser revertido antes.
 *
 * Não move dinheiro, então não exige caixa aberto nem farol verde.
 */
export async function updateReceivableAction(
  _prev: EditReceivableState,
  formData: FormData,
): Promise<EditReceivableState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const current = await prisma.receivable.findUnique({
    where: { id: d.id },
    select: { status: true, category: true, saleId: true, partSaleId: true, recurringId: true },
  });
  if (!current) return { error: "Título não encontrado." };
  if (current.status === "RECEBIDO") {
    return { error: "Título já recebido. Use Reverter antes de editar." };
  }
  if (current.saleId || current.partSaleId || current.recurringId) {
    return { error: "Este título vem de outra operação (venda/peça/recorrência). Ajuste na origem." };
  }

  const label = (d.categoryLabel || "").trim();
  if (!label) return { error: "Informe a categoria." };
  const cat = await resolveReceitaCategory(label);

  const flow = d.structuralKey || "ADMINISTRATIVO";
  const capitalBeneficiaryId = flow === "CAPITAL" ? d.capitalBeneficiaryId || null : null;
  if (flow === "CAPITAL" && !capitalBeneficiaryId) {
    return { error: "Escolha o beneficiário do capital." };
  }

  try {
    await assertMonthOpen(parseDateInput(d.dueDate));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mês fechado." };
  }

  await updateManualReceivable({
    id: d.id,
    description: d.description,
    category: cat.category,
    categoryLabel: cat.label,
    documentNumber: d.documentNumber?.trim() || null,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    customerId: d.customerId || null,
    capitalBeneficiaryId,
    costCenterId: flow === "CAPITAL" ? null : d.costCenterId || null,
    structuralKey: flow,
    notes: d.notes?.trim() || null,
  });

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect("/financeiro/a-receber");
}
