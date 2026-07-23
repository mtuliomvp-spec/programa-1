"use server";

import { revalidatePath } from "next/cache";
import { parseDateInput } from "@/lib/format";
import { assertCan } from "@/lib/guards";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { aplicar, registrarRendimento, resgatar } from "@/lib/investments";

export type InvestFormState = { error?: string; ok?: boolean };

async function guard(date: Date) {
  await assertCan("financeiro", "contas");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await assertMonthOpen(date);
}

function revalidate(accountId: string) {
  revalidatePath(`/financeiro/contas/${accountId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/capital");
  revalidatePath("/financeiro/livro-caixa");
}

export async function aplicarAction(
  accountId: string,
  _prev: InvestFormState,
  formData: FormData,
): Promise<InvestFormState> {
  const date = parseDateInput(String(formData.get("date") || ""));
  const source = String(formData.get("source") || "CAIXA") as "CAIXA" | "EXTERNO";
  try {
    await guard(date);
    await aplicar({
      accountId,
      beneficiaryId: String(formData.get("beneficiaryId") || ""),
      amount: Number(formData.get("amount") || 0),
      date,
      source,
      fromAccountId: source === "CAIXA" ? String(formData.get("fromAccountId") || "") : undefined,
      description: String(formData.get("description") || "") || null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível aplicar." };
  }
  revalidate(accountId);
  return { ok: true };
}

export async function rendimentoAction(
  accountId: string,
  splits: { beneficiaryId: string; amount: number }[],
  dateStr: string,
  description: string,
): Promise<InvestFormState> {
  const date = parseDateInput(dateStr);
  try {
    await guard(date);
    await registrarRendimento({ accountId, date, splits, description: description || null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível registrar o rendimento." };
  }
  revalidate(accountId);
  return { ok: true };
}

export async function resgatarAction(
  accountId: string,
  _prev: InvestFormState,
  formData: FormData,
): Promise<InvestFormState> {
  const date = parseDateInput(String(formData.get("date") || ""));
  try {
    await guard(date);
    await resgatar({
      accountId,
      beneficiaryId: String(formData.get("beneficiaryId") || ""),
      amount: Number(formData.get("amount") || 0),
      date,
      description: String(formData.get("description") || "") || null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível resgatar." };
  }
  revalidate(accountId);
  return { ok: true };
}
