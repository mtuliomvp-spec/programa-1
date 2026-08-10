"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createCashEntry, deleteCashEntry, resolveSupplierByName } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, assertCashDateIsWorkDate } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { resolveDespesaCategory } from "@/lib/categories";

const schema = z.object({
  kind: z.enum(["entrada", "saida"]),
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  date: z.string().min(1, "Informe a data"),
  accountId: z.string().min(1, "Escolha a conta"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  supplierName: z.string().optional(),
  vehicleId: z.string().optional(),
  customerId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
});

export type CashEntryState = { error?: string; ok?: boolean };

export async function createCashEntryAction(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  try {
    await assertCan("financeiro", "criar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    await assertCashDateIsWorkDate(parseDateInput(d.date));
    await assertMonthOpen(parseDateInput(d.date));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const label = d.kind === "saida" ? (d.categoryLabel || "").trim() : "";
  const isCapital = d.structuralKey === "CAPITAL";
  const supplierName = (d.supplierName || "").trim();

  // Toda saída precisa de categoria; e de fornecedor — exceto no Capital, onde
  // o fornecedor é opcional (o valor pode ter sido pago ao próprio beneficiário).
  if (d.kind === "saida") {
    if (!label) return { error: "Informe a categoria do lançamento." };
    if (isCapital && !d.capitalBeneficiaryId) {
      return { error: "Escolha o beneficiário do capital." };
    }
    if (!supplierName && !isCapital) {
      return { error: "Informe o fornecedor do lançamento." };
    }
  } else if (isCapital && !d.capitalBeneficiaryId) {
    // Entrada no Capital = aporte: precisa do beneficiário.
    return { error: "Escolha o beneficiário do capital (aporte)." };
  }

  // Resolve a categoria da saída (rótulo canônico + enum); cria custom se nova.
  const cat = d.kind === "saida" && label ? await resolveDespesaCategory(label) : null;

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // Também no Capital — pode-se pagar a um fornecedor por conta do beneficiário.
  const supplierId =
    d.kind === "saida" && supplierName ? await resolveSupplierByName(supplierName) : null;

  await createCashEntry({
    kind: d.kind,
    description: d.description,
    amount: d.amount,
    date: parseDateInput(d.date),
    accountId: d.accountId,
    category: d.kind === "saida" ? cat?.category ?? "OUTROS" : undefined,
    categoryLabel: cat?.label ?? null,
    documentNumber: d.documentNumber?.trim() || null,
    structuralKey: d.structuralKey,
    supplierId,
    vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
    customerId: d.kind === "entrada" ? d.customerId || null : null,
    capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
    notes: d.notes || null,
  });

  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCashEntryAction(kind: "entrada" | "saida", id: string) {
  await assertCan("financeiro", "criar");
  await deleteCashEntry(kind, id);
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/estoque");
  revalidatePath("/");
}
