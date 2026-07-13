"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markPayablePaid, markPayablePending, createManualPayable, resolveSupplierByName } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";

export async function markPaidAction(id: string, accountId?: string) {
  await markPayablePaid(id, new Date(), accountId || null);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

export type PayBatchResult = { ok: boolean; paid: number; error?: string };

/**
 * Baixa um ou vários títulos de uma vez pela conta escolhida (pagamento em
 * lote, como na Agrasty). A data padrão é hoje; se informada, usa a data dada.
 */
export async function payBatchAction(
  ids: string[],
  accountId: string,
  dateInput?: string,
): Promise<PayBatchResult> {
  if (!ids.length) return { ok: false, paid: 0, error: "Selecione ao menos um título." };
  if (!accountId) return { ok: false, paid: 0, error: "Escolha a conta que fará o pagamento." };
  const date = dateInput ? parseDateInput(dateInput) : new Date();
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

export async function markPendingAction(id: string) {
  await markPayablePending(id);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

const manualSchema = z.object({
  description: z.string().min(1, "Informe a descrição"),
  categoryLabel: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
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
  const parsed = manualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

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

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // Também no Capital — pode-se pagar a um fornecedor por conta do beneficiário.
  const supplierId = await resolveSupplierByName(supplierName);

  await createManualPayable({
    description: d.description,
    category: KNOWN_CATEGORIES[label.toLowerCase()] || "OUTROS",
    categoryLabel: label,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    supplierId,
    costCenterId: isCapital ? null : d.costCenterId || null,
    structuralKey: d.structuralKey,
    vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
    capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
    notes: d.notes || null,
    alreadyPaid: Boolean(d.alreadyPaid),
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect("/financeiro/a-pagar");
}
