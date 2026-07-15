"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { parseDateInput } from "@/lib/format";
import { saleSchema, registerSaleCore, type SaleFormState, type SaleData } from "../sale-core";

/**
 * Cria (ou atualiza) uma pré-venda: um rascunho da negociação para revisão e
 * impressão. NÃO gera nenhum lançamento financeiro. Redireciona para a ficha.
 */
export async function createPreSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const parsed = saleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;
  const preSaleId = String(formData.get("preSaleId") || "").trim();

  const data = {
    vehicleId: d.vehicleId,
    customerId: d.customerId,
    saleDate: parseDateInput(d.saleDate),
    totalAmount: d.totalAmount,
    paymentMethod: d.paymentMethod,
    downPayment: d.paymentMethod === "PARCELADO" ? d.downPayment : 0,
    installmentsCount: d.paymentMethod === "PARCELADO" ? d.installmentsCount : 0,
    financerAccountId: d.paymentMethod === "FINANCIADO" ? d.financerAccountId || null : null,
    financedAmount: d.paymentMethod === "FINANCIADO" ? d.financedAmount ?? null : null,
    sellerName: d.sellerName || null,
    notes: d.notes || null,
    tradeIn: !!d.tradeIn,
    tiPlate: d.tradeIn ? d.tiPlate?.toUpperCase() || null : null,
    tiBrand: d.tradeIn ? d.tiBrand || null : null,
    tiModel: d.tradeIn ? d.tiModel || null : null,
    tiVersion: d.tradeIn ? d.tiVersion || null : null,
    tiManufactureYear: d.tradeIn ? d.tiManufactureYear ?? null : null,
    tiModelYear: d.tradeIn ? d.tiModelYear ?? null : null,
    tiColor: d.tradeIn ? d.tiColor || null : null,
    tiKm: d.tradeIn ? d.tiKm ?? null : null,
    tiFuel: d.tradeIn ? d.tiFuel || null : null,
    tiTransmission: d.tradeIn ? d.tiTransmission || null : null,
    tiChassi: d.tradeIn ? d.tiChassi || null : null,
    tiNegotiated: d.tradeIn ? d.tiNegotiated ?? null : null,
    tiPayoff: d.tradeIn ? d.tiPayoff ?? null : null,
    tiPayoffTo: d.tradeIn ? d.tiPayoffTo || null : null,
    tiDebts: d.tradeIn ? d.tiDebts ?? null : null,
    tiSupplierName: d.tradeIn ? d.tiSupplierName || null : null,
  };

  let id: string;
  if (preSaleId) {
    const updated = await prisma.preSale.update({ where: { id: preSaleId }, data });
    id = updated.id;
  } else {
    const created = await prisma.preSale.create({ data });
    id = created.id;
  }

  revalidatePath("/vendas");
  redirect(`/vendas/pre-vendas/${id}`);
}

/** Converte a pré-venda em venda de fato (gera os lançamentos). */
export async function convertPreSaleAction(id: string): Promise<void> {
  const pre = await prisma.preSale.findUniqueOrThrow({ where: { id } });
  if (pre.status === "CONVERTIDA" && pre.convertedSaleId) {
    redirect(`/vendas/${pre.convertedSaleId}`);
  }

  const d: SaleData = {
    vehicleId: pre.vehicleId,
    customerId: pre.customerId,
    saleDate: pre.saleDate.toISOString().slice(0, 10),
    totalAmount: pre.totalAmount,
    paymentMethod: pre.paymentMethod,
    downPayment: pre.downPayment,
    installmentsCount: pre.installmentsCount,
    financerAccountId: pre.financerAccountId ?? undefined,
    financedAmount: pre.financedAmount ?? undefined,
    sellerName: pre.sellerName ?? undefined,
    notes: pre.notes ?? undefined,
    tradeIn: pre.tradeIn,
    tiPlate: pre.tiPlate ?? undefined,
    tiBrand: pre.tiBrand ?? undefined,
    tiModel: pre.tiModel ?? undefined,
    tiVersion: pre.tiVersion ?? undefined,
    tiManufactureYear: pre.tiManufactureYear ?? undefined,
    tiModelYear: pre.tiModelYear ?? undefined,
    tiColor: pre.tiColor ?? undefined,
    tiKm: pre.tiKm ?? undefined,
    tiFuel: pre.tiFuel ?? undefined,
    tiTransmission: pre.tiTransmission ?? undefined,
    tiChassi: pre.tiChassi ?? undefined,
    tiNegotiated: pre.tiNegotiated ?? undefined,
    tiPayoff: pre.tiPayoff ?? undefined,
    tiPayoffTo: pre.tiPayoffTo ?? undefined,
    tiDebts: pre.tiDebts ?? undefined,
    tiSupplierName: pre.tiSupplierName ?? undefined,
  };

  try {
    await assertBooksBalanced();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lançamento bloqueado.";
    redirect(`/vendas/pre-vendas/${id}?erro=${encodeURIComponent(msg)}`);
  }

  let saleId: string;
  try {
    saleId = await registerSaleCore(d);
  } catch (err) {
    // Mostra o erro real na própria ficha em vez de uma tela de erro genérica.
    const msg = err instanceof Error ? err.message : "Não foi possível registrar a venda.";
    redirect(`/vendas/pre-vendas/${id}?erro=${encodeURIComponent(msg)}`);
  }
  await prisma.preSale.update({
    where: { id },
    data: { status: "CONVERTIDA", convertedSaleId: saleId },
  });

  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  redirect(`/vendas/${saleId}`);
}

/** Exclui a pré-venda (não afeta nada financeiro). */
export async function deletePreSaleAction(id: string): Promise<void> {
  await prisma.preSale.delete({ where: { id } });
  revalidatePath("/vendas");
  redirect("/vendas");
}
