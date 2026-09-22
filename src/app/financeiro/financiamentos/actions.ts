"use server";

import { revalidatePath } from "next/cache";
import {
  trocarFinanceiraDaVenda,
  settleFinancing,
  settleReturn,
  settleInsurance,
  reverseFinancing,
  reverseReturn,
  reverseInsurance,
} from "@/lib/finance";
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

export async function settleInsuranceAction(
  saleId: string,
  accountId: string,
  amount: number,
  commission: number,
): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Informe o valor recebido do seguro." };
  }
  try {
    await assertCan("financeiro", "receber");
    await assertBooksBalanced();
    await assertCashboxOpen();
    // Mesma regra das demais baixas: data de trabalho do caixa aberto.
    const date = await getCashboxWorkDate();
    await assertMonthOpen(date);
    await settleInsurance(saleId, accountId, amount, commission, date);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível receber a comissão do seguro.",
    };
  }
  revalidateFinancing();
  return { ok: true };
}

export async function reverseInsuranceAction(saleId: string): Promise<SettleResult> {
  try {
    await assertCan("financeiro", "receber");
    await assertBooksBalanced();
    await reverseInsurance(saleId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível estornar." };
  }
  revalidateFinancing();
  return { ok: true };
}

export type TrocaFinanceiraResult = {
  ok: boolean;
  error?: string;
  message?: string;
  avisos?: string[];
};

/**
 * Corrige a financeira de uma venda já registrada (a operação saiu por uma e o
 * negócio era com outra). Não mexe em valor nem em data: o repasse, o retorno e
 * as baixas já feitas apenas mudam de financeira.
 */
export async function trocarFinanceiraAction(
  saleId: string,
  financerAccountId: string,
): Promise<TrocaFinanceiraResult> {
  if (!financerAccountId) return { ok: false, error: "Escolha a financeira certa." };
  try {
    await assertCan("vendas", "cancelar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  try {
    const r = await trocarFinanceiraDaVenda(saleId, financerAccountId);
    revalidateFinancing();
    revalidatePath("/vendas");
    revalidatePath("/financeiro/a-receber");
    return {
      ok: true,
      message: `Financeira trocada de ${r.de || "—"} para ${r.para}.`,
      avisos: r.avisos,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível trocar a financeira." };
  }
}
