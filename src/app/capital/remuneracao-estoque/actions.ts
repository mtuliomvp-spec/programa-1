"use server";

import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/guards";
import { parseDateInput } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { runStockInterest, reverseStockInterest } from "@/lib/stock-interest";

export type StockInterestFormState = { error?: string; ok?: boolean };

type SplitInput = { beneficiaryId: string; percent?: number; amount?: number };

/**
 * Roda a rotina de remuneração de capital sobre o estoque. Recebe do form:
 * taxa (ratePercent), vehicleIds (múltiplos), rateio (splits JSON), data e
 * descrição. Bloqueia lançamento em mês fechado.
 */
export async function runStockInterestAction(
  _prev: StockInterestFormState,
  formData: FormData,
): Promise<StockInterestFormState> {
  try {
    await assertCan("administrativo", "capital");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const ratePercent = Number(formData.get("ratePercent") || 0);
  const vehicleIds = formData.getAll("vehicleIds").map((v) => String(v)).filter(Boolean);
  const date = parseDateInput(String(formData.get("date") || ""));
  const description = String(formData.get("description") || "").trim() || null;
  const splitMode = String(formData.get("splitMode") || "PERCENT") === "VALOR" ? "VALOR" : "PERCENT";

  let splits: SplitInput[] = [];
  try {
    const raw = JSON.parse(String(formData.get("splits") || "[]"));
    if (Array.isArray(raw)) {
      splits = raw
        .map((s) => ({
          beneficiaryId: String(s.beneficiaryId || ""),
          percent: Number(s.percent),
          amount: Number(s.amount),
        }))
        .filter((s) => s.beneficiaryId);
    }
  } catch {
    return { error: "Rateio inválido." };
  }

  try {
    await assertMonthOpen(date);
    const user = await getSessionUser();
    await runStockInterest({
      ratePercent,
      vehicleIds,
      splits,
      splitMode,
      date,
      description,
      createdBy: user?.name || null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível rodar a rotina." };
  }

  revalidatePath("/capital/remuneracao-estoque");
  revalidatePath("/capital");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/livro-caixa");
  return { ok: true };
}

/** Estorna um lote (bloqueado se algum veículo já foi vendido ou o mês fechou). */
export async function reverseStockInterestAction(
  runId: string,
  runDate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("administrativo", "capital");
    await assertMonthOpen(new Date(runDate));
    await reverseStockInterest(runId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível estornar." };
  }
  revalidatePath("/capital/remuneracao-estoque");
  revalidatePath("/capital");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/livro-caixa");
  return { ok: true };
}
