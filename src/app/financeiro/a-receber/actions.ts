"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markReceivableReceived, markReceivablePending, createManualReceivable } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";

export async function markReceivedAction(id: string) {
  await markReceivableReceived(id, new Date());
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

export async function markPendingAction(id: string) {
  await markReceivablePending(id);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

const manualSchema = z.object({
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  customerId: z.string().optional(),
  costCenterId: z.string().optional(),
  notes: z.string().optional(),
  alreadyReceived: z.coerce.boolean().optional(),
});

export type ManualReceivableState = { error?: string };

export async function createManualReceivableAction(
  _prev: ManualReceivableState,
  formData: FormData,
): Promise<ManualReceivableState> {
  const parsed = manualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  await createManualReceivable({
    description: d.description,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    customerId: d.customerId || null,
    costCenterId: d.costCenterId || null,
    notes: d.notes || null,
    alreadyReceived: Boolean(d.alreadyReceived),
  });

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  redirect("/financeiro/a-receber");
}
