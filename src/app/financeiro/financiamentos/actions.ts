"use server";

import { revalidatePath } from "next/cache";
import { settleFinancing } from "@/lib/finance";

export type SettleResult = { ok: boolean; error?: string };

export async function settleFinancingAction(saleId: string, accountId: string): Promise<SettleResult> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  try {
    await settleFinancing(saleId, accountId, new Date());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível dar baixa." };
  }
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: true };
}
