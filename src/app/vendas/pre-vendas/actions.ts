"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { parseDateInput } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { saleSchema, registerSaleCore, assertNoConflictingPreSale, type SaleFormState, type SaleData } from "../sale-core";

/**
 * Cria (ou atualiza) uma pré-venda: um rascunho da negociação para revisão e
 * impressão. NÃO gera nenhum lançamento financeiro. Redireciona para a ficha.
 */
export async function createPreSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  try {
    await assertCan("vendas", "prevenda");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = saleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;
  const preSaleId = String(formData.get("preSaleId") || "").trim();

  // Parcelamento informado ao comprador: obrigatório quando há parcelas.
  if (d.paymentMethod !== "A_VISTA") {
    if (!d.installmentsInfoCount || d.installmentsInfoCount < 1 || !d.installmentsInfoAmount || d.installmentsInfoAmount <= 0) {
      return { error: "Informe a quantidade e o valor das parcelas que o comprador vai pagar (para o contrato)." };
    }
  }

  // Vendedor = usuário: resolve o nome (foto) a partir do id escolhido.
  let sellerName: string | null = d.sellerName || null;
  if (d.sellerId) {
    const u = await prisma.user.findUnique({ where: { id: d.sellerId }, select: { name: true } });
    sellerName = u?.name ?? sellerName;
  }

  // Não permitir pré-vender o mesmo veículo para outro cliente enquanto houver
  // pré-venda em aberto (ignora a própria pré-venda ao editá-la).
  try {
    await assertNoConflictingPreSale(d.vehicleId, d.customerId, preSaleId || undefined);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Veículo já pré-vendido para outro cliente." };
  }

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
    returnLevel: d.paymentMethod === "FINANCIADO" ? Math.max(0, d.returnLevel || 0) : 0,
    sellerName,
    sellerId: d.sellerId || null,
    commissionAmount: Math.max(0, d.commissionAmount || 0),
    referrals: d.referrals ?? [],
    transferCharged: Boolean(d.transferCharged),
    transferAmount: Math.max(0, d.transferAmount || 0),
    takeReturnCommission: Boolean(d.takeReturnCommission),
    viaPaidTraffic: Boolean(d.viaPaidTraffic),
    installmentsInfoCount: d.paymentMethod !== "A_VISTA" ? d.installmentsInfoCount ?? null : null,
    installmentsInfoAmount: d.paymentMethod !== "A_VISTA" ? d.installmentsInfoAmount ?? null : null,
    notes: d.notes || null,
    ownerRefundToCapital: Boolean(d.ownerRefundToCapital),
    ownerRefundBeneficiaryId: d.ownerRefundToCapital ? d.ownerRefundBeneficiaryId || null : null,
    buyerBankName: d.buyerBankName || null,
    buyerBankAgency: d.buyerBankAgency || null,
    buyerBankAccount: d.buyerBankAccount || null,
    buyerBankAccountType: d.buyerBankAccountType || null,
    buyerPixKey: d.buyerPixKey || null,
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
  try {
    await assertCan("vendas", "registrar");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sem permissão.";
    redirect(`/vendas/pre-vendas/${id}?erro=${encodeURIComponent(msg)}`);
  }
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
    returnLevel: pre.returnLevel ?? 0,
    sellerName: pre.sellerName ?? undefined,
    sellerId: pre.sellerId ?? undefined,
    commissionAmount: pre.commissionAmount ?? 0,
    referrals: parseReferrals(pre.referrals),
    transferCharged: pre.transferCharged,
    transferAmount: pre.transferAmount ?? 0,
    takeReturnCommission: pre.takeReturnCommission,
    viaPaidTraffic: pre.viaPaidTraffic,
    installmentsInfoCount: pre.installmentsInfoCount ?? undefined,
    installmentsInfoAmount: pre.installmentsInfoAmount ?? undefined,
    notes: pre.notes ?? undefined,
    ownerRefundToCapital: pre.ownerRefundToCapital,
    ownerRefundBeneficiaryId: pre.ownerRefundBeneficiaryId ?? undefined,
    buyerBankName: pre.buyerBankName ?? undefined,
    buyerBankAgency: pre.buyerBankAgency ?? undefined,
    buyerBankAccount: pre.buyerBankAccount ?? undefined,
    buyerBankAccountType: pre.buyerBankAccountType ?? undefined,
    buyerPixKey: pre.buyerPixKey ?? undefined,
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
    await assertCashboxOpen();
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
  revalidatePath("/capital");
  revalidatePath("/");
  redirect(`/vendas/${saleId}`);
}

/**
 * Exclui a pré-venda (não afeta nada financeiro). Idempotente (deleteMany não
 * estoura se já tiver sido removida). A navegação é feita no cliente após a
 * conclusão — mais confiável que redirect() dentro de useTransition.
 */
export async function deletePreSaleAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("vendas", "prevenda");
    await prisma.preSale.deleteMany({ where: { id } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível excluir a pré-venda." };
  }
  revalidatePath("/vendas");
  return { ok: true };
}
