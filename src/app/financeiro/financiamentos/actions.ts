"use server";

import { revalidatePath } from "next/cache";
import { settleFinancing, settleReturn, reverseFinancing, reverseReturn } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { assertCan } from "@/lib/guards";

export type SettleResult = { ok: boolean; error?: string };

function revalidateFinancing() {
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

export async function settleFinancingAction(saleId: string, accountId: string): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  try {
    await assertCan("financeiro", "receber");
    await assertBooksBalanced();
    await assertCashboxOpen();
    // A baixa usa a data de trabalho do caixa aberto (como as demais baixas),
    // não a data do clique — o movimento cai no dia do caixa.
    const date = await getCashboxWorkDate();
    await assertMonthOpen(date);
    await settleFinancing(saleId, accountId, date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível dar baixa." };
  }
  revalidateFinancing();
  return { ok: true };
}

/** Estorna a baixa do financiamento (correção — não passa pelas travas). */
export async function reverseFinancingAction(saleId: string): Promise<SettleResult> {
  try {
    await assertCan("financeiro", "receber");
    await reverseFinancing(saleId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível estornar." };
  }
  revalidateFinancing();
  return { ok: true };
}

/** Estorna a baixa do retorno (correção — não passa pelas travas). */
export async function reverseReturnAction(saleId: string): Promise<SettleResult> {
  try {
    await assertCan("financeiro", "receber");
    await reverseReturn(saleId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível estornar." };
  }
  revalidateFinancing();
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
    await assertCan("financeiro", "receber");
    await assertBooksBalanced();
    await assertCashboxOpen();
    // Mesma regra da baixa do repasse: data de trabalho do caixa aberto.
    const date = await getCashboxWorkDate();
    await assertMonthOpen(date);
    await settleReturn(saleId, accountId, actualAmount, date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível receber o retorno." };
  }
  revalidateFinancing();
  return { ok: true };
}
