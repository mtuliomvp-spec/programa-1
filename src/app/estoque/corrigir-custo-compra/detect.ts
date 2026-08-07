import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Encontra "custos do veículo" que são, na verdade, a COMPRA do próprio carro —
 * o mesmo dinheiro contado duas vezes (o preço de compra já está no cadastro do
 * veículo, e o custo total é `purchasePrice + soma(VehicleCost)`).
 *
 * Como isso acontecia: abrir o título de compra em Contas a pagar → Editar e
 * salvar criava um `VehicleCost` com o valor da compra e ainda rebaixava a
 * categoria do título de "Compra de veículo" para "Outros". A guarda em
 * `isVehiclePurchase` (src/lib/finance.ts) impede que aconteça de novo; esta
 * varredura limpa o que já ficou errado.
 */

const PURCHASE_PREFIX = "Compra do veículo";

export type DuplicatedPurchaseCost = {
  costId: string;
  costDescription: string;
  amount: number;
  vehicleId: string;
  vehicleLabel: string;
  vehicleStatus: string;
  purchasePrice: number;
  payableId: string | null;
  payableStatus: string | null;
  /** Título rebaixado para "Outros": precisa voltar a ser "Compra de veículo". */
  needsCategoryFix: boolean;
};

export async function findDuplicatedPurchaseCosts(): Promise<DuplicatedPurchaseCost[]> {
  const costs = await prisma.vehicleCost.findMany({
    where: {
      OR: [
        // O título vinculado É a compra do carro.
        { payable: { category: "COMPRA_VEICULO" } },
        // Mesmo caso, com a categoria já rebaixada para "Outros" na edição.
        { payable: { description: { startsWith: PURCHASE_PREFIX } } },
        // Custo órfão: o título foi regenerado (ex.: ao editar o veículo) e o
        // custo ficou para trás somando eternamente (onDelete: SetNull).
        { payableId: null, description: { contains: PURCHASE_PREFIX } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      description: true,
      amount: true,
      vehicleId: true,
      vehicle: {
        select: { brand: true, model: true, plate: true, purchasePrice: true, status: true },
      },
      payable: { select: { id: true, category: true, description: true, status: true, vehicleId: true } },
    },
  });

  const found: DuplicatedPurchaseCost[] = [];
  for (const c of costs) {
    const p = c.payable;
    let duplicated = false;
    if (p) {
      if (p.category === "COMPRA_VEICULO") duplicated = true;
      else if (p.description.startsWith(PURCHASE_PREFIX) && p.vehicleId === c.vehicleId) {
        duplicated = true;
      }
    } else if (
      c.description.includes(PURCHASE_PREFIX) &&
      Math.abs(c.amount - c.vehicle.purchasePrice) < 0.01
    ) {
      duplicated = true;
    }
    if (!duplicated) continue;

    found.push({
      costId: c.id,
      costDescription: c.description,
      amount: c.amount,
      vehicleId: c.vehicleId,
      vehicleLabel: `${c.vehicle.brand} ${c.vehicle.model} · ${c.vehicle.plate}`,
      vehicleStatus: c.vehicle.status,
      purchasePrice: c.vehicle.purchasePrice,
      payableId: p?.id ?? null,
      payableStatus: p?.status ?? null,
      needsCategoryFix: Boolean(p) && p!.category !== "COMPRA_VEICULO",
    });
  }
  return found;
}
