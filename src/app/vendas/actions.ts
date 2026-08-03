"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cancelVehicleSale } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan, userCanAny } from "@/lib/guards";
import { saleSchema, registerSaleCore, assertNoConflictingPreSale, type SaleFormState } from "./sale-core";

/**
 * Verifica, em tempo real (ao escolher veículo/cliente no formulário), se o
 * veículo já tem uma pré-venda em aberto para OUTRO cliente. Devolve a mensagem
 * a ser exibida imediatamente, sem esperar o envio.
 */
export async function checkPreSaleConflictAction(
  vehicleId: string,
  customerId: string,
  excludePreSaleId?: string,
): Promise<{ conflict: boolean; message?: string }> {
  if (!vehicleId || !customerId) return { conflict: false };
  // Probe usado no formulário de venda: exige acesso a vendas; senão não bloqueia.
  const allowed = await userCanAny([
    ["vendas", "visualizar"],
    ["vendas", "prevenda"],
    ["vendas", "registrar"],
  ]);
  if (!allowed) return { conflict: false };
  try {
    await assertNoConflictingPreSale(vehicleId, customerId, excludePreSaleId || undefined);
    return { conflict: false };
  } catch (e) {
    return { conflict: true, message: e instanceof Error ? e.message : "Veículo já pré-vendido para outro cliente." };
  }
}

export async function createSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  try {
    await assertCan("vendas", "registrar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = saleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;

  let saleId: string;
  try {
    saleId = await registerSaleCore(d);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível registrar a venda." };
  }

  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect(`/vendas/${saleId}`);
}

export async function cancelSaleAction(id: string) {
  await assertCan("vendas", "cancelar");
  // Antes de cancelar: a venda estava concluída? Qual pré-venda a gerou?
  const before = await prisma.sale.findUnique({ where: { id }, select: { status: true } });
  const pre = await prisma.preSale.findFirst({
    where: { convertedSaleId: id, status: "CONVERTIDA" },
    select: { id: true },
  });
  await cancelVehicleSale(id);
  // Cancelamento de uma venda concluída: reabre a pré-venda que a gerou (volta a
  // ABERTA) para ajustar e registrar de novo sem redigitar a negociação. No modo
  // "corrigir resíduos" (venda já cancelada) nada é reaberto.
  let reopenedPreSaleId: string | null = null;
  if (before?.status === "CONCLUIDA" && pre) {
    await prisma.preSale.update({
      where: { id: pre.id },
      data: { status: "ABERTA", convertedSaleId: null },
    });
    reopenedPreSaleId = pre.id;
  }
  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/a-pagar");
  // Consignado com devolução aplicada no capital: atualiza a visão do capital.
  revalidatePath("/capital");
  revalidatePath("/");
  if (reopenedPreSaleId) {
    revalidatePath(`/vendas/pre-vendas/${reopenedPreSaleId}`);
    redirect(`/vendas/pre-vendas/${reopenedPreSaleId}?reaberta=1`);
  }
  redirect(`/vendas/${id}`);
}
