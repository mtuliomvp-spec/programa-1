"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { resolveSupplierByName } from "@/lib/finance";
import { assertCan } from "@/lib/guards";
import { parseDateInput } from "@/lib/format";
import { resolveDespesaCategory, resolveReceitaCategory } from "@/lib/categories";

const recurringSchema = z.object({
  kind: z.enum(["PAGAR", "RECEBER"]),
  description: z.string().min(1, "Informe a descrição"),
  // Fatura de cartão pode começar com 0 (o valor real vem dos lançamentos);
  // nas demais o valor precisa ser positivo (validado após o parse).
  amount: z.coerce.number().min(0, "Informe um valor válido"),
  cardInvoice: z.coerce.boolean().optional(),
  structuralKey: z.enum(["VEICULOS", "ADMINISTRATIVO", "CAPITAL"]).default("ADMINISTRATIVO"),
  periodicidade: z.enum(["MENSAL", "DIAS"]).default("MENSAL"),
  dayOfMonth: z.coerce.number().int().min(1).max(31).default(5),
  intervalDays: z.coerce.number().int().min(1).max(365).optional(),
  // Antecipa o vencimento para o último dia útil (fim de semana/feriado).
  anticipateToBusinessDay: z.coerce.boolean().optional(),
  categoryLabel: z.string().optional(),
  supplierName: z.string().optional(),
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
  const isCard = data.kind === "PAGAR" && Boolean(data.cardInvoice);
  if (!isCard && data.amount <= 0) {
    return { error: "Informe um valor maior que zero." };
  }
  const porDias = data.periodicidade === "DIAS";
  if (porDias && !data.intervalDays) {
    return { error: "Informe de quantos em quantos dias (1 a 365)." };
  }
  const isCapital = data.structuralKey === "CAPITAL";
  if (isCapital && !data.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do fluxo Capital." };
  }

  const label = (data.categoryLabel || "").trim();
  if (!isCapital && !label) {
    return { error: "Informe a categoria." };
  }
  // No fluxo Capital a categoria não é despesa/receita — usa OUTROS, sem rótulo.
  // Fora dele, resolve o rótulo escolhido/digitado para enum + nome canônico.
  let categoryPagar: "COMPRA_VEICULO" | "COMPRA_PECA" | "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "DEVOLUCAO_CLIENTE" | "DEVOLUCAO_PROPRIETARIO" | "OUTROS" | null = null;
  let categoryReceber: "VENDA_VEICULO" | "VENDA_PECA" | "RETORNO_FINANCEIRA" | "OUTROS" | null = null;
  let categoryLabel: string | null = null;
  if (data.kind === "PAGAR") {
    if (isCapital) categoryPagar = "OUTROS";
    else {
      const cat = await resolveDespesaCategory(label);
      categoryPagar = cat.category;
      categoryLabel = cat.label;
    }
  } else {
    if (isCapital) categoryReceber = "OUTROS";
    else {
      const cat = await resolveReceitaCategory(label);
      categoryReceber = cat.category;
      categoryLabel = cat.label;
    }
  }

  // Fornecedor por nome (campo com digitação livre): reaproveita ou cadastra.
  const supplierName = (data.supplierName || "").trim();
  const supplierId =
    data.kind === "PAGAR" && supplierName ? await resolveSupplierByName(supplierName) : null;

  try {
    await prisma.recurringEntry.create({
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        structuralKey: data.structuralKey,
        dayOfMonth: data.dayOfMonth,
        intervalDays: porDias ? data.intervalDays : null,
        anticipateToBusinessDay: Boolean(data.anticipateToBusinessDay),
        cardInvoice: isCard,
        categoryPagar,
        categoryReceber,
        categoryLabel,
        supplierId,
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

const updateSchema = recurringSchema.extend({ id: z.string().min(1) });

/**
 * Edita a DEFINIÇÃO de uma recorrência. Os títulos já gerados permanecem como
 * estão (podem ser ajustados/excluídos individualmente); as próximas gerações
 * usam os novos valores.
 */
export async function updateRecurringAction(
  _prev: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;
  const isCard = data.kind === "PAGAR" && Boolean(data.cardInvoice);
  if (!isCard && data.amount <= 0) {
    return { error: "Informe um valor maior que zero." };
  }
  const porDias = data.periodicidade === "DIAS";
  if (porDias && !data.intervalDays) {
    return { error: "Informe de quantos em quantos dias (1 a 365)." };
  }
  const isCapital = data.structuralKey === "CAPITAL";
  if (isCapital && !data.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do fluxo Capital." };
  }

  const label = (data.categoryLabel || "").trim();
  if (!isCapital && !label) {
    return { error: "Informe a categoria." };
  }
  let categoryPagar: "COMPRA_VEICULO" | "COMPRA_PECA" | "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "DEVOLUCAO_CLIENTE" | "DEVOLUCAO_PROPRIETARIO" | "OUTROS" | null = null;
  let categoryReceber: "VENDA_VEICULO" | "VENDA_PECA" | "RETORNO_FINANCEIRA" | "OUTROS" | null = null;
  let categoryLabel: string | null = null;
  if (data.kind === "PAGAR") {
    if (isCapital) categoryPagar = "OUTROS";
    else {
      const cat = await resolveDespesaCategory(label);
      categoryPagar = cat.category;
      categoryLabel = cat.label;
    }
  } else {
    if (isCapital) categoryReceber = "OUTROS";
    else {
      const cat = await resolveReceitaCategory(label);
      categoryReceber = cat.category;
      categoryLabel = cat.label;
    }
  }

  const supplierName = (data.supplierName || "").trim();
  const supplierId =
    data.kind === "PAGAR" && supplierName ? await resolveSupplierByName(supplierName) : null;

  const existing = await prisma.recurringEntry.findUnique({ where: { id: data.id }, select: { id: true } });
  if (!existing) return { error: "Recorrência não encontrada." };

  try {
    await prisma.recurringEntry.update({
      where: { id: data.id },
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        structuralKey: data.structuralKey,
        dayOfMonth: data.dayOfMonth,
        intervalDays: porDias ? data.intervalDays : null,
        anticipateToBusinessDay: Boolean(data.anticipateToBusinessDay),
        cardInvoice: isCard,
        categoryPagar,
        categoryReceber,
        categoryLabel,
        supplierId,
        customerId: data.kind === "RECEBER" && !isCapital ? data.customerId || null : null,
        capitalBeneficiaryId: isCapital ? data.capitalBeneficiaryId || null : null,
        startDate: parseDateInput(data.startDate),
        endDate: data.endDate ? parseDateInput(data.endDate) : null,
        notes: data.notes || null,
      },
    });
    await ensureRecurringGenerated();
  } catch {
    return { error: "Não foi possível salvar as alterações." };
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
