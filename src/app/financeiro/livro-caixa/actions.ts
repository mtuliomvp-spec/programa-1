"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createCashEntry, deleteCashEntry } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";

const schema = z.object({
  kind: z.enum(["entrada", "saida"]),
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  date: z.string().min(1, "Informe a data"),
  accountId: z.string().min(1, "Escolha a conta"),
  category: z.enum(["DESPESA_OPERACIONAL", "COMISSAO", "SALARIO", "COMBUSTIVEL", "OUTROS"]).optional(),
  notes: z.string().optional(),
});

export type CashEntryState = { error?: string; ok?: boolean };

export async function createCashEntryAction(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  await createCashEntry({
    kind: d.kind,
    description: d.description,
    amount: d.amount,
    date: parseDateInput(d.date),
    accountId: d.accountId,
    category: d.kind === "saida" ? d.category : undefined,
    notes: d.notes || null,
  });

  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCashEntryAction(kind: "entrada" | "saida", id: string) {
  await deleteCashEntry(kind, id);
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}
