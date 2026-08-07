"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCanAny } from "@/lib/guards";
import { findDuplicatedPurchaseCosts } from "./detect";

export type FixResult = {
  ok: boolean;
  removed: number;
  categoriesFixed: number;
  vehicles: string[];
  error?: string;
};

/**
 * Remove os "custos do veículo" que duplicam o preço de compra do carro e
 * devolve a categoria "Compra de veículo" aos títulos que foram rebaixados
 * para "Outros" na edição.
 *
 * Neutro no farol: a equação patrimonial avalia o estoque pelo que foi PAGO e
 * não usa VehicleCost (src/lib/patrimonial.ts), e o Lucro/Prejuízo exclui das
 * despesas todo título ligado a um veículo (src/lib/reports.ts). Em carro já
 * VENDIDO, o custo removido e a categoria restaurada se compensam no balde
 * "A pagar de veículos vendidos".
 *
 * Idempotente: depois de rodar, a varredura não encontra mais nada.
 */
export async function fixVehiclePurchaseCostsAction(): Promise<FixResult> {
  try {
    await assertCanAny([
      ["estoque", "editar"],
      ["financeiro", "criar"],
    ]);
  } catch (e) {
    return {
      ok: false,
      removed: 0,
      categoriesFixed: 0,
      vehicles: [],
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  // Refaz a detecção no servidor — não confia em ids vindos da tela.
  const found = await findDuplicatedPurchaseCosts();
  if (found.length === 0) {
    return { ok: true, removed: 0, categoriesFixed: 0, vehicles: [] };
  }

  const costIds = found.map((f) => f.costId);
  const payableIds = found.filter((f) => f.needsCategoryFix && f.payableId).map((f) => f.payableId!);

  const [, fixed] = await prisma.$transaction([
    prisma.vehicleCost.deleteMany({ where: { id: { in: costIds } } }),
    prisma.payable.updateMany({
      where: { id: { in: payableIds } },
      data: { category: "COMPRA_VEICULO", categoryLabel: null },
    }),
  ]);

  revalidatePath("/estoque");
  revalidatePath("/estoque/corrigir-custo-compra");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/relatorios/lucro-veiculo");
  revalidatePath("/");
  for (const id of new Set(found.map((f) => f.vehicleId))) {
    revalidatePath(`/estoque/${id}`);
  }

  return {
    ok: true,
    removed: costIds.length,
    categoriesFixed: fixed.count,
    vehicles: [...new Set(found.map((f) => f.vehicleLabel))],
  };
}
