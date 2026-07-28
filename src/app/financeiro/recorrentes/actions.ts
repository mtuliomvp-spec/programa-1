"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { assertCan } from "@/lib/guards";
import { parseDateInput } from "@/lib/format";

const recurringSchema = z.object({
  kind: z.enum(["PAGAR", "RECEBER"]),
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  structuralKey: z.enum(["VEICULOS", "ADMINISTRATIVO", "CAPITAL"]).default("ADMINISTRATIVO"),
  periodicidade: z.enum(["MENSAL", "DIAS"]).default("MENSAL"),
  dayOfMonth: z.coerce.number().int().min(1).max(31).default(5),
  intervalDays: z.coerce.number().int().min(1).max(365).optional(),
  categoryPagar: z
    .enum(["COMPRA_VEICULO", "COMPRA_PECA", "DESPESA_OPERACIONAL", "COMISSAO", "SALARIO", "COMBUSTIVEL", "OUTROS"])
    .optional(),
  categoryReceber: z.enum(["VENDA_VEICULO", "VENDA_PECA", "OUTROS"]).optional(),
  supplierId: z.string().optional(),
  customerId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export type RecurringFormState = { error?: string };

export async function createRecurringAction(
  _prev: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;
  const porDias = data.periodicidade === "DIAS";
  if (porDias && !data.intervalDays) {
    return { error: "Informe de quantos em quantos dias (1 a 365)." };
  }
  const isCapital = data.structuralKey === "CAPITAL";
  if (isCapital && !data.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do fluxo Capital." };
  }

  try {
    await prisma.recurringEntry.create({
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        structuralKey: data.structuralKey,
        dayOfMonth: data.dayOfMonth,
        intervalDays: porDias ? data.intervalDays : null,
        // No fluxo Capital a categoria não é despesa/receita — usa OUTROS.
        categoryPagar: data.kind === "PAGAR" ? (isCapital ? "OUTROS" : data.categoryPagar ?? "DESPESA_OPERACIONAL") : null,
        categoryReceber: data.kind === "RECEBER" ? (isCapital ? "OUTROS" : data.categoryReceber ?? "OUTROS") : null,
        supplierId: data.kind === "PAGAR" ? data.supplierId || null : null,
        customerId: data.kind === "RECEBER" && !isCapital ? data.customerId || null : null,
        capitalBeneficiaryId: isCapital ? data.capitalBeneficiaryId || null : null,
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
  await assertCan("financeiro", "criar");
  await prisma.recurringEntry.update({ where: { id }, data: { active } });
  revalidatePath("/financeiro/recorrentes");
}

export async function deleteRecurringAction(id: string) {
  await assertCan("financeiro", "criar");
  // as contas já geradas ficam no financeiro; apenas param de ser criadas
  await prisma.recurringEntry.delete({ where: { id } });
  revalidatePath("/financeiro/recorrentes");
}

/**
 * Gera na hora os títulos recorrentes. Não exige caixa aberto/farol verde: só
 * cria títulos PENDENTE (sem baixa/dinheiro). Usa antecedência maior (45 dias)
 * para já puxar a próxima ocorrência, mesmo faltando mais de 15 dias.
 */
export async function generateNowAction(): Promise<{ ok: boolean; created?: number; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const created = await ensureRecurringGenerated(45);
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  return { ok: true, created };
}
