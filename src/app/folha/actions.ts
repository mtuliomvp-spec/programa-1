"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";

const employeeSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  role: z.string().optional(),
  cpf: z.string().optional(),
  pixKey: z.string().optional(),
  salary: z.coerce.number().min(0, "Informe o salário"),
  admissionDate: z.string().min(1),
  notes: z.string().optional(),
});

export type FolhaFormState = { error?: string };

export async function createEmployeeAction(
  _prev: FolhaFormState,
  formData: FormData,
): Promise<FolhaFormState> {
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  await prisma.employee.create({
    data: {
      name: parsed.data.name,
      role: parsed.data.role || null,
      cpf: parsed.data.cpf || null,
      pixKey: parsed.data.pixKey || null,
      salary: parsed.data.salary,
      admissionDate: parseDateInput(parsed.data.admissionDate),
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/folha");
  return {};
}

export async function toggleEmployeeAction(id: string, active: boolean) {
  await prisma.employee.update({
    where: { id },
    data: { active, dismissalDate: active ? null : new Date() },
  });
  revalidatePath("/folha");
}

/** Gera a folha do mês corrente: uma conta a pagar por funcionário ativo,
 * com vencimento no dia 5 do mês seguinte. Idempotente por competência. */
export async function generatePayrollAction(): Promise<{ created: number }> {
  await assertBooksBalanced();
  await assertCashboxOpen();
  const now = new Date();
  const competencia = `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()}`;
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 5, 12));

  const employees = await prisma.employee.findMany({ where: { active: true } });
  let created = 0;

  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  for (const employee of employees) {
    if (employee.salary <= 0) continue;
    const description = `Salário ${employee.name} - ${competencia}`;
    const existing = await prisma.payable.findFirst({
      where: { employeeId: employee.id, description },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.payable.create({
      data: {
        description,
        category: "SALARIO",
        amount: employee.salary,
        dueDate,
        status: "PENDENTE",
        employeeId: employee.id,
        notes: employee.pixKey ? `PIX: ${employee.pixKey}` : null,
        costCenterId: adminCenterId,
      },
    });
    created++;
  }

  revalidatePath("/folha");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  return { created };
}
