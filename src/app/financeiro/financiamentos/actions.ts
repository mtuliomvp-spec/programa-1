"use server";

import { revalidatePath } from "next/cache";
import { settleFinancing, settleReturn } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";

export type SettleResult = { ok: boolean; error?: string };

export async function settleFinancingAction(saleId: string, accountId: string): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  try {
    await assertBooksBalanced();
    await settleFinancing(saleId, accountId, new Date());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível dar baixa." };
  }
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: true };
}

export async function settleReturnAction(
  saleId: string,
  accountId: string,
  actualAmount: number,
): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  if (!Number.isFinite(actualAmount) || actualAmount < 0) {
    return { ok: false, error: "Informe o valor recebido." };
  }
  try {
    await assertBooksBalanced();
    await settleReturn(saleId, accountId, actualAmount, new Date());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível receber o retorno." };
  }
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: true };
}
