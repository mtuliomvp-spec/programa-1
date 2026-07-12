"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export type ResetState = { error?: string; success?: string };

/**
 * Zera os dados operacionais do sistema (somente ADMIN), preservando os
 * usuários e os parâmetros da empresa. Exige confirmação digitando "ZERAR".
 */
export async function resetSystemDataAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { error: "Apenas administradores podem zerar os dados." };
  }
  const confirm = String(formData.get("confirm") || "").trim();
  if (confirm !== "ZERAR") {
    return { error: 'Para confirmar, digite exatamente ZERAR (em maiúsculas).' };
  }

  try {
    // Ordem respeitando as chaves estrangeiras (filhos primeiro).
    await prisma.$transaction([
      prisma.accountTransfer.deleteMany(),
      prisma.capitalTransaction.deleteMany(),
      prisma.fuelEntry.deleteMany(),
      prisma.vehicleCost.deleteMany(),
      prisma.receivable.deleteMany(),
      prisma.payable.deleteMany(),
      prisma.partSale.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.part.deleteMany(),
      prisma.vehicle.deleteMany(),
      prisma.purchaseRequest.deleteMany(),
      prisma.consortium.deleteMany(),
      prisma.recurringEntry.deleteMany(),
      prisma.capitalBeneficiary.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.costCenter.deleteMany(),
      prisma.financialAccount.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.supplier.deleteMany(),
    ]);
  } catch {
    return { error: "Não foi possível zerar os dados. Tente novamente." };
  }

  revalidatePath("/", "layout");
  return {
    success:
      "Dados zerados com sucesso. Usuários e parâmetros da empresa foram preservados. Faça um novo backup quando quiser.",
  };
}
