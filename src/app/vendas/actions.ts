"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelVehicleSale } from "@/lib/finance";
import { saleSchema, registerSaleCore, type SaleFormState } from "./sale-core";

export async function createSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const parsed = saleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;

  let saleId: string;
  try {
    saleId = await registerSaleCore(d);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível registrar a venda." };
  }

  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/${saleId}`);
}

export async function cancelSaleAction(id: string) {
  await cancelVehicleSale(id);
  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/${id}`);
}
