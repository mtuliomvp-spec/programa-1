"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registerVehicleSale, cancelVehicleSale } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";

const saleSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  customerId: z.string().min(1, "Selecione o cliente"),
  saleDate: z.string().min(1),
  totalAmount: z.coerce.number().min(0.01, "Informe o valor da venda"),
  paymentMethod: z.enum(["A_VISTA", "PARCELADO", "FINANCIADO"]),
  downPayment: z.coerce.number().min(0).default(0),
  installmentsCount: z.coerce.number().int().min(0).default(0),
  sellerName: z.string().optional(),
  notes: z.string().optional(),
});

export type SaleFormState = { error?: string };

export async function createSaleAction(_prev: SaleFormState, formData: FormData): Promise<SaleFormState> {
  const parsed = saleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;

  if (d.paymentMethod === "PARCELADO") {
    if (d.downPayment > d.totalAmount) {
      return { error: "A entrada não pode ser maior que o valor total da venda." };
    }
    if (d.installmentsCount < 1) {
      return { error: "Informe o número de parcelas." };
    }
  }

  let saleId: string;
  try {
    const sale = await registerVehicleSale({
      vehicleId: d.vehicleId,
      customerId: d.customerId,
      saleDate: parseDateInput(d.saleDate),
      totalAmount: d.totalAmount,
      downPayment: d.paymentMethod === "PARCELADO" ? d.downPayment : 0,
      installmentsCount: d.paymentMethod === "PARCELADO" ? d.installmentsCount : 0,
      paymentMethod: d.paymentMethod,
      sellerName: d.sellerName || null,
      notes: d.notes || null,
    });
    saleId = sale.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível registrar a venda." };
  }

  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  redirect(`/vendas/${saleId}`);
}

export async function cancelSaleAction(id: string) {
  await cancelVehicleSale(id);
  revalidatePath("/vendas");
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  redirect(`/vendas/${id}`);
}
