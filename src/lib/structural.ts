import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Centros de custo estruturais — o equivalente às "obras estruturais" do
 * Agrasty. Todo lançamento financeiro do sistema passa por um deles (ou por
 * um centro criado pelo usuário, como uma obra ou imóvel):
 *
 * - CAPITAL:        aportes, retiradas e pró-labore dos sócios/empresa
 * - VEICULOS:       compra, custos e venda de veículos e peças
 * - ADMINISTRATIVO: demais despesas e receitas (folha, combustível, etc.)
 */

export const STRUCTURAL_CENTERS = [
  { key: "CAPITAL", name: "Capital", notes: "Aportes, retiradas e pró-labore" },
  { key: "VEICULOS", name: "Veículos", notes: "Compra, custos e venda de veículos e peças" },
  { key: "ADMINISTRATIVO", name: "Administrativo", notes: "Despesas e receitas administrativas" },
] as const;

export type StructuralKey = (typeof STRUCTURAL_CENTERS)[number]["key"];

/** Cria os centros estruturais (idempotente) e classifica lançamentos antigos. */
export async function ensureStructuralCostCenters(): Promise<Record<StructuralKey, string>> {
  const ids = {} as Record<StructuralKey, string>;
  for (const def of STRUCTURAL_CENTERS) {
    const center = await prisma.costCenter.upsert({
      where: { key: def.key },
      update: {},
      create: { key: def.key, name: def.name, type: "ESTRUTURAL", structural: true, notes: def.notes },
    });
    ids[def.key] = center.id;
  }

  // Reclassifica lançamentos antigos que ainda não têm centro de custo.
  // 1) Movimentações de capital (vinculadas a CapitalTransaction) → Capital
  const capitalLinks = await prisma.capitalTransaction.findMany({
    select: { payableId: true, receivableId: true },
  });
  const capPayableIds = capitalLinks.map((t) => t.payableId).filter((x): x is string => !!x);
  const capReceivableIds = capitalLinks.map((t) => t.receivableId).filter((x): x is string => !!x);
  if (capPayableIds.length) {
    await prisma.payable.updateMany({
      where: { id: { in: capPayableIds }, costCenterId: null },
      data: { costCenterId: ids.CAPITAL },
    });
  }
  if (capReceivableIds.length) {
    await prisma.receivable.updateMany({
      where: { id: { in: capReceivableIds }, costCenterId: null },
      data: { costCenterId: ids.CAPITAL },
    });
  }

  // 2) Vinculados a veículos/peças → Veículos
  await prisma.payable.updateMany({
    where: { costCenterId: null, OR: [{ vehicleId: { not: null } }, { partId: { not: null } }] },
    data: { costCenterId: ids.VEICULOS },
  });
  await prisma.receivable.updateMany({
    where: { costCenterId: null, OR: [{ saleId: { not: null } }, { partSaleId: { not: null } }] },
    data: { costCenterId: ids.VEICULOS },
  });

  // 3) Todo o restante → Administrativo
  await prisma.payable.updateMany({
    where: { costCenterId: null },
    data: { costCenterId: ids.ADMINISTRATIVO },
  });
  await prisma.receivable.updateMany({
    where: { costCenterId: null },
    data: { costCenterId: ids.ADMINISTRATIVO },
  });

  return ids;
}

/** Id de um centro estrutural, criando os três se ainda não existirem. */
export async function structuralCenterId(key: StructuralKey): Promise<string> {
  const found = await prisma.costCenter.findUnique({ where: { key } });
  if (found) return found.id;
  const ids = await ensureStructuralCostCenters();
  return ids[key];
}
