"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markPayablePaid, markPayablePending, createManualPayable } from "@/lib/finance";
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
  category: z.enum(["DESPESA_OPERACIONAL", "COMISSAO", "SALARIO", "COMBUSTIVEL", "OUTROS"]),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  supplierId: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  notes: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
});

export type ManualPayableState = { error?: string };

export async function createManualPayableAction(
  _prev: ManualPayableState,
  formData: FormData,
): Promise<ManualPayableState> {
  const parsed = manualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  await createManualPayable({
    description: d.description,
    category: d.category,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    supplierId: d.supplierId || null,
    costCenterId: d.costCenterId || null,
    structuralKey: d.structuralKey,
    notes: d.notes || null,
    alreadyPaid: Boolean(d.alreadyPaid),
  });

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect("/financeiro/a-pagar");
}
