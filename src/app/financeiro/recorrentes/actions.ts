"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { parseDateInput } from "@/lib/format";

const recurringSchema = z.object({
  kind: z.enum(["PAGAR", "RECEBER"]),
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  dayOfMonth: z.coerce.number().int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31"),
  categoryPagar: z
    .enum(["COMPRA_VEICULO", "COMPRA_PECA", "DESPESA_OPERACIONAL", "COMISSAO", "SALARIO", "COMBUSTIVEL", "OUTROS"])
    .optional(),
  categoryReceber: z.enum(["VENDA_VEICULO", "VENDA_PECA", "OUTROS"]).optional(),
  supplierId: z.string().optional(),
  customerId: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export type RecurringFormState = { error?: string };

export async function createRecurringAction(
  _prev: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  try {
    await prisma.recurringEntry.create({
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        dayOfMonth: data.dayOfMonth,
        categoryPagar: data.kind === "PAGAR" ? data.categoryPagar ?? "DESPESA_OPERACIONAL" : null,
        categoryReceber: data.kind === "RECEBER" ? data.categoryReceber ?? "OUTROS" : null,
        supplierId: data.kind === "PAGAR" ? data.supplierId || null : null,
        customerId: data.kind === "RECEBER" ? data.customerId || null : null,
        startDate: parseDateInput(data.startDate),
        endDate: data.endDate ? parseDateInput(data.endDate) : null,
        notes: data.notes || null,
      },
    });
    await ensureRecurringGenerated();
  } catch {
    return { error: "Não foi possível salvar a recorrência." };
  }
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  redirect("/financeiro/recorrentes");
}

export async function toggleRecurringAction(id: string, active: boolean) {
  await prisma.recurringEntry.update({ where: { id }, data: { active } });
  revalidatePath("/financeiro/recorrentes");
}

export async function deleteRecurringAction(id: string) {
  // as contas já geradas ficam no financeiro; apenas param de ser criadas
  await prisma.recurringEntry.delete({ where: { id } });
  revalidatePath("/financeiro/recorrentes");
}

export async function generateNowAction() {
  await assertBooksBalanced();
  await assertCashboxOpen();
  const created = await ensureRecurringGenerated();
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  return created;
}
