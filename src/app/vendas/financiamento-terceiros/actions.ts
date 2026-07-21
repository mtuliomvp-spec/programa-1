"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { cancelVehicleSale } from "@/lib/finance";
import {
  intermediationSchema,
  registerIntermediationCore,
  type IntermediationFormState,
} from "./core";

export async function createIntermediationAction(
  _prev: IntermediationFormState,
  formData: FormData,
): Promise<IntermediationFormState> {
  try {
    await assertCan("vendas", "registrar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = intermediationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }

  let saleId: string;
  try {
    saleId = await registerIntermediationCore(parsed.data);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Não foi possível registrar o financiamento de terceiros.",
    };
  }

  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/financiamento-terceiros/${saleId}`);
}

export async function cancelIntermediationAction(id: string) {
  await assertCan("vendas", "cancelar");
  await cancelVehicleSale(id);
  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/financiamento-terceiros/${id}`);
}
