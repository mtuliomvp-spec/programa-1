"use server";

import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/guards";
import { closeMonth, reopenMonth } from "@/lib/monthly-closing";

export type ClosingActionResult = { ok: boolean; error?: string };

function revalidateAll() {
  revalidatePath("/financeiro/fechamento");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/lucro-prejuizo");
  revalidatePath("/relatorios/dre");
  revalidatePath("/capital");
  revalidatePath("/");
}

export async function closeMonthAction(year: number, month: number): Promise<ClosingActionResult> {
  try {
    const user = await assertCan("financeiro", "fechar");
    await closeMonth(year, month, user.name);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível fechar o mês." };
  }
  revalidateAll();
  return { ok: true };
}

export async function reopenMonthAction(year: number, month: number): Promise<ClosingActionResult> {
  try {
    await assertCan("financeiro", "reabrir");
    await reopenMonth(year, month);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível reabrir o mês." };
  }
  revalidateAll();
  return { ok: true };
}
