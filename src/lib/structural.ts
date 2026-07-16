import { prisma } from "@/lib/prisma";
import { STRUCTURAL_FLOWS, type StructuralKey } from "@/lib/structural-flows";

/**
 * Centros de custo estruturais — o equivalente às "obras estruturais" do
 * Agrasty. Todo lançamento financeiro do sistema passa por um deles (ou por
 * um centro criado pelo usuário, como uma obra ou imóvel):
 *
 * - CAPITAL:        aportes, retiradas e pró-labore dos sócios/empresa
 * - VEICULOS:       compra, custos e venda de veículos e peças
 * - ADMINISTRATIVO: demais despesas e receitas (folha, combustível, etc.)
 *
 * A lista canônica dos fluxos fica em `structural-flows.ts` (arquivo puro,
 * usável no cliente). Aqui apenas reexportamos para não quebrar imports.
 */

export const STRUCTURAL_CENTERS = STRUCTURAL_FLOWS;

export type { StructuralKey };

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

  // 2b) Reclassifica despesas ligadas a um veículo conforme a regra da loja:
  //   - veículo EM ESTOQUE → centro Veículos (é custo do carro)
  //   - veículo já VENDIDO → centro Administrativo (despesa pós-venda)
  // Idempotente. (updateMany não filtra por relação, então buscamos os ids.)

  // Combustível de veículo EM ESTOQUE que ficou no Administrativo → Veículos.
  const fuelToVeiculos = await prisma.payable.findMany({
    where: {
      category: "COMBUSTIVEL",
      costCenterId: ids.ADMINISTRATIVO,
      vehicle: { is: { status: { not: "VENDIDO" } } },
    },
    select: { id: true },
  });
  if (fuelToVeiculos.length) {
    await prisma.payable.updateMany({
      where: { id: { in: fuelToVeiculos.map((p) => p.id) } },
      data: { costCenterId: ids.VEICULOS },
    });
  }

  // Combustível de veículo já VENDIDO que está no Veículos → Administrativo.
  const fuelToAdmin = await prisma.payable.findMany({
    where: {
      category: "COMBUSTIVEL",
      costCenterId: ids.VEICULOS,
      vehicle: { is: { status: "VENDIDO" } },
    },
    select: { id: true },
  });
  if (fuelToAdmin.length) {
    await prisma.payable.updateMany({
      where: { id: { in: fuelToAdmin.map((p) => p.id) } },
      data: { costCenterId: ids.ADMINISTRATIVO },
    });
  }

  // Combustível ligado a um veículo precisa existir como VehicleCost, senão o
  // valor fica invisível ao Lucro/Prejuízo (divergindo da equação patrimonial).
  await ensureVehicleFuelCosts();

  // Custos de veículo marcados como PÓS-VENDA que ficaram no Veículos →
  // Administrativo (o carro não está mais no estoque).
  const postSaleCosts = await prisma.vehicleCost.findMany({
    where: { postSale: true, payableId: { not: null } },
    select: { payableId: true },
  });
  const postSalePayableIds = postSaleCosts
    .map((c) => c.payableId)
    .filter((x): x is string => !!x);
  if (postSalePayableIds.length) {
    await prisma.payable.updateMany({
      where: { id: { in: postSalePayableIds }, costCenterId: ids.VEICULOS },
      data: { costCenterId: ids.ADMINISTRATIVO },
    });
  }

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

/**
 * Cria o VehicleCost faltante para notas de combustível ligadas a um veículo
 * (idempotente). Sem esse custo, o valor do combustível fica invisível ao
 * Lucro/Prejuízo, divergindo da equação patrimonial. postSale = status atual do
 * veículo (em estoque → custo da venda; vendido → custo pós-venda).
 */
export async function ensureVehicleFuelCosts(): Promise<void> {
  const fuelSemCusto = await prisma.payable.findMany({
    where: { category: "COMBUSTIVEL", vehicleId: { not: null }, vehicleCost: null },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      notes: true,
      vehicleId: true,
      vehicle: { select: { status: true } },
    },
  });
  for (const p of fuelSemCusto) {
    if (!p.vehicleId) continue;
    await prisma.vehicleCost.create({
      data: {
        vehicleId: p.vehicleId,
        description: "Combustível",
        category: "OUTROS",
        amount: p.amount,
        date: p.dueDate,
        postSale: p.vehicle?.status === "VENDIDO",
        notes: p.notes,
        payableId: p.id,
      },
    });
  }
}

/** Id de um centro estrutural, criando os três se ainda não existirem. */
export async function structuralCenterId(key: StructuralKey): Promise<string> {
  const found = await prisma.costCenter.findUnique({ where: { key } });
  if (found) return found.id;
  const ids = await ensureStructuralCostCenters();
  return ids[key];
}

/**
 * Resumo dos três fluxos estruturais para o painel: despesas, receitas e
 * resultado de cada um. Garante que os centros existam antes de somar.
 */
export async function getStructuralSummary() {
  await ensureStructuralCostCenters();
  const centers = await prisma.costCenter.findMany({
    where: { structural: true },
    include: {
      payables: { select: { amount: true, status: true, vehicle: { select: { status: true } } } },
      receivables: { select: { amount: true, status: true } },
    },
  });
  const byKey = new Map(centers.map((c) => [c.key, c]));
  return STRUCTURAL_CENTERS.map((def) => {
    const c = byKey.get(def.key);
    const isVeiculos = def.key === "VEICULOS";
    let despesas = 0;
    let imobilizado = 0; // veículos em estoque JÁ PAGOS (ativo)
    let negociadoPendente = 0; // veículos em estoque ainda NÃO pagos
    for (const p of c?.payables ?? []) {
      const paid = p.status === "PAGO";
      const veiculoEmEstoque = isVeiculos && p.vehicle && p.vehicle.status !== "VENDIDO";
      if (veiculoEmEstoque) {
        // Veículo em estoque é capital imobilizado (um ativo), não despesa. E,
        // seguindo a regra da loja, só conta o que já foi efetivamente pago; o
        // negociado ainda a pagar fica à parte.
        if (paid) imobilizado += p.amount;
        else negociadoPendente += p.amount;
      } else if (paid) {
        // Só o que foi pago vira despesa realizada.
        despesas += p.amount;
      }
    }
    // Só o que foi efetivamente recebido vira receita realizada.
    const receitas = c?.receivables.reduce((s, r) => s + (r.status === "RECEBIDO" ? r.amount : 0), 0) ?? 0;
    return {
      key: def.key,
      name: def.name,
      despesas,
      receitas,
      imobilizado,
      negociadoPendente,
      resultado: receitas - despesas,
    };
  });
}
