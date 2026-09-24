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
import { assertCashboxOpen, getCashboxState, getCashboxWorkDate } from "@/lib/cashbox";
import { formatDate, parseDateInput } from "@/lib/format";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { assertCan } from "@/lib/guards";

export type SettleResult = { ok: boolean; error?: string; enfileirado?: boolean; data?: string };

/**
 * O crédito caiu num dia À FRENTE do movimento aberto? Então a baixa não pode
 * sair agora (todo lançamento tem a data do caixa aberto): devolve a data para
 * o repasse/retorno ir para a fila e esperar o caixa daquele dia. Mesmo dia ou
 * antes devolve null — a baixa sai já, no caixa aberto, como sempre saiu.
 *
 * Com o caixa fechado, a referência é o último movimento: dá para informar o
 * que caiu depois dele sem abrir o caixa.
 */
async function dataDaFila(dataCredito?: string): Promise<Date | null> {
  if (!dataCredito || !/^\d{4}-\d{2}-\d{2}$/.test(dataCredito)) return null;
  const data = parseDateInput(dataCredito);
  const { open, session } = await getCashboxState();
  const ref = session?.workDate ?? null;
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  if (!ref || dia(data) > dia(ref)) return data;
  if (!open) {
    throw new Error(
      `O caixa está fechado. Abra o caixa em "Contas e caixas" — ou informe uma data de crédito depois de ${formatDate(ref)} para deixar na fila.`,
    );
  }
  return null;
}

function revalidateFinancing() {
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

export async function settleFinancingAction(
  saleId: string,
  accountId: string,
  dataCredito?: string,
): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  try {
    await assertCan("financeiro", "receber");
    const fila = await dataDaFila(dataCredito);
    if (fila) {
      const { enfileirarVenda } = await import("@/lib/payment-queue");
      await enfileirarVenda({ tipo: "financiamento", saleId, data: fila, accountId });
      revalidateFinancing();
      return { ok: true, enfileirado: true, data: fila.toISOString() };
    }
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
  dataCredito?: string,
): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  if (!Number.isFinite(actualAmount) || actualAmount < 0) {
    return { ok: false, error: "Informe o valor recebido." };
  }
  try {
    await assertCan("financeiro", "receber");
    const fila = await dataDaFila(dataCredito);
    if (fila) {
      const { enfileirarVenda } = await import("@/lib/payment-queue");
      await enfileirarVenda({ tipo: "retorno", saleId, data: fila, accountId, valor: actualAmount });
      revalidateFinancing();
      return { ok: true, enfileirado: true, data: fila.toISOString() };
    }
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

/**
 * Tira da fila o repasse/retorno informado (engano de data, de conta, de
 * valor): nada foi creditado, a venda volta a mostrar o "Receber".
 */
export async function tirarDaFilaAction(
  saleId: string,
  tipo: "financiamento" | "retorno",
): Promise<SettleResult> {
  try {
    await assertCan("financeiro", "receber");
    const { desenfileirarVenda } = await import("@/lib/payment-queue");
    await desenfileirarVenda({ tipo, saleId });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível tirar da fila." };
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
