"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCanAny } from "@/lib/guards";
import { syncCardInvoiceDerived } from "@/lib/card-invoice";

/**
 * Lançamentos da fatura de cartão (itens dentro de um título cardInvoice).
 * Só título NÃO pago pode ser alterado (pago → reverter antes, como na edição).
 * Toda mudança re-sincroniza: valor do título = soma dos itens; item VEICULOS
 * com carro vira custo do veículo; item CAPITAL com sócio vira retirada na baixa.
 */

export type CardItemFormState = { error?: string };

const itemSchema = z.object({
  payableId: z.string().min(1),
  description: z.string().min(1, "Descreva o lançamento (como está na fatura)"),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  structuralKey: z.enum(["ADMINISTRATIVO", "VEICULOS", "CAPITAL"]).default("ADMINISTRATIVO"),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
});

async function guardPayable(payableId: string): Promise<string | null> {
  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    select: { cardInvoice: true, status: true },
  });
  if (!payable) return "Título não encontrado.";
  if (!payable.cardInvoice) return "Este título não é uma fatura de cartão.";
  if (payable.status === "PAGO") return "Fatura já paga — reverta a baixa antes de alterar os lançamentos.";
  return null;
}

function revalidateAll() {
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
}

export async function addCardItemAction(
  _prev: CardItemFormState,
  formData: FormData,
): Promise<CardItemFormState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = itemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const guardError = await guardPayable(d.payableId);
  if (guardError) return { error: guardError };

  if (d.structuralKey === "CAPITAL" && !d.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do lançamento no Capital." };
  }

  await prisma.cardInvoiceItem.create({
    data: {
      payableId: d.payableId,
      description: d.description.trim(),
      amount: d.amount,
      structuralKey: d.structuralKey,
      vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: d.structuralKey === "CAPITAL" ? d.capitalBeneficiaryId || null : null,
    },
  });
  await syncCardInvoiceDerived(d.payableId);
  revalidateAll();
  return {};
}

const updateItemSchema = itemSchema.omit({ payableId: true }).extend({ itemId: z.string().min(1) });

/** Edita um lançamento da fatura (descrição, valor e fluxo) e re-sincroniza tudo. */
export async function updateCardItemAction(formData: FormData): Promise<CardItemFormState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updateItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: d.itemId },
    select: { payableId: true },
  });
  if (!item) return { error: "Lançamento não encontrado." };
  const guardError = await guardPayable(item.payableId);
  if (guardError) return { error: guardError };

  if (d.structuralKey === "CAPITAL" && !d.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do lançamento no Capital." };
  }

  await prisma.cardInvoiceItem.update({
    where: { id: d.itemId },
    data: {
      description: d.description.trim(),
      amount: d.amount,
      structuralKey: d.structuralKey,
      vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: d.structuralKey === "CAPITAL" ? d.capitalBeneficiaryId || null : null,
    },
  });
  await syncCardInvoiceDerived(item.payableId);
  revalidateAll();
  return {};
}

export async function deleteCardItemAction(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const item = await prisma.cardInvoiceItem.findUnique({
    where: { id: itemId },
    select: { payableId: true },
  });
  if (!item) return { ok: false, error: "Lançamento não encontrado." };
  const guardError = await guardPayable(item.payableId);
  if (guardError) return { ok: false, error: guardError };

  // O custo do veículo e a retirada vinculados caem junto (cascade 1:1).
  await prisma.cardInvoiceItem.delete({ where: { id: itemId } });
  await syncCardInvoiceDerived(item.payableId);
  revalidateAll();
  return { ok: true };
}
