"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { cancelVehicleSale } from "@/lib/finance";
import {
  intermediationSchema,
  createIntermediationPreSale,
  convertIntermediationPreSale,
  type IntermediationFormState,
} from "./core";

/** Gera a pré-venda (ficha) — não movimenta dinheiro, então não exige caixa. */
export async function createIntermediationPreSaleAction(
  _prev: IntermediationFormState,
  formData: FormData,
): Promise<IntermediationFormState> {
  try {
    await assertCan("vendas", "registrar");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = intermediationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  let preSaleId: string;
  try {
    preSaleId = await createIntermediationPreSale(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível gerar a pré-venda." };
  }

  revalidatePath("/vendas/financiamento-terceiros");
  redirect(`/vendas/financiamento-terceiros/pre/${preSaleId}`);
}

/** Conclui a pré-venda → gera a venda (movimenta dinheiro, exige caixa aberto). */
export async function convertIntermediationAction(preSaleId: string) {
  try {
    await assertCan("vendas", "registrar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lançamento bloqueado.";
    redirect(`/vendas/financiamento-terceiros/pre/${preSaleId}?erro=${encodeURIComponent(msg)}`);
  }
  let saleId: string;
  try {
    saleId = await convertIntermediationPreSale(preSaleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não foi possível concluir a operação.";
    redirect(`/vendas/financiamento-terceiros/pre/${preSaleId}?erro=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/financiamento-terceiros/${saleId}`);
}

/** Cancela a pré-venda (ainda não concluída) e apaga o veículo de terceiro. */
export async function cancelIntermediationPreSaleAction(preSaleId: string) {
  await assertCan("vendas", "registrar");
  const pre = await prisma.preSale.findUnique({ where: { id: preSaleId } });
  if (pre && pre.status === "ABERTA") {
    await prisma.preSale.update({ where: { id: preSaleId }, data: { status: "CANCELADA" } });
    // O veículo de terceiro só existe por causa desta ficha: remove o órfão.
    await prisma.vehicle
      .deleteMany({ where: { id: pre.vehicleId, intermediation: true, sale: { is: null } } })
      .catch(() => {});
  }
  revalidatePath("/vendas/financiamento-terceiros");
  redirect("/vendas/financiamento-terceiros");
}

/** Cancela uma operação já concluída (reverte os lançamentos). */
export async function cancelIntermediationAction(id: string) {
  await assertCan("vendas", "cancelar");
  await cancelVehicleSale(id);
  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/financiamento-terceiros/${id}`);
}
