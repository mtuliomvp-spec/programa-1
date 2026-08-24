import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { STRUCTURAL_FLOWS, type StructuralKey } from "@/lib/structural-flows";

/**
 * Centros de custo estruturais — o equivalente às "obras estruturais" do
 * Agrasty. Todo lançamento financeiro do sistema passa por um deles (ou por
 * um centro criado pelo usuário, como uma obra ou imóvel):
 *
 * - CAPITAL:        aportes, retiradas e pró-labore dos sócios/empresa
 * - VEICULOS:       compra, custos e venda de veículos
 * - PECAS:          compra e venda de peças do almoxarifado
 * - ADMINISTRATIVO: demais despesas e receitas (folha, combustível, etc.)
 *
 * A lista canônica dos fluxos fica em `structural-flows.ts` (arquivo puro,
 * usável no cliente). Aqui apenas reexportamos para não quebrar imports.
 */

export const STRUCTURAL_CENTERS = STRUCTURAL_FLOWS;

export type { StructuralKey };

/** Cria os centros estruturais (idempotente) e classifica lançamentos antigos. */
export async function ensureStructuralCostCenters(): Promise<Record<StructuralKey, string>> {
  return timed("conserto: centros de custo", structuralCostCenters);
}

async function structuralCostCenters(): Promise<Record<StructuralKey, string>> {
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

  // 2) Vinculados a veículos → Veículos
  await prisma.payable.updateMany({
    where: { costCenterId: null, vehicleId: { not: null } },
    data: { costCenterId: ids.VEICULOS },
  });
  await prisma.receivable.updateMany({
    where: { costCenterId: null, saleId: { not: null } },
    data: { costCenterId: ids.VEICULOS },
  });

  // 2a) Almoxarifado → Peças. Compra de peça (sem veículo) e venda de peça
  // passaram a ter fluxo próprio; antes ficavam no Veículos. Reclassifica tanto
  // as sem centro quanto as antigas que ficaram no Veículos — peça comprada PARA
  // UM CARRO (vehicleId) continua no fluxo do veículo, que é onde vira custo.
  await prisma.payable.updateMany({
    where: {
      partId: { not: null },
      vehicleId: null,
      OR: [{ costCenterId: null }, { costCenterId: ids.VEICULOS }],
    },
    data: { costCenterId: ids.PECAS },
  });
  await prisma.receivable.updateMany({
    where: {
      partSaleId: { not: null },
      OR: [{ costCenterId: null }, { costCenterId: ids.VEICULOS }],
    },
    data: { costCenterId: ids.PECAS },
  });

  // 2b) Combustível ligado a um veículo: garante o VehicleCost e a classificação
  // correta (custo do carro se abastecido em estoque; pós-venda se depois da
  // venda), pela data do abastecimento vs. a data da venda.
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
 * Represa de 1 minuto (mesmo molde de `ensureRecurringGeneratedForPage`, em
 * src/lib/recurring.ts): esta é uma rotina de CONSERTO que escreve no banco, e
 * ela era chamada de dentro do farol — ou seja, em toda gravação do sistema,
 * varrendo os títulos de combustível e serializando 5 consultas antes de
 * qualquer leitura começar. O caminho normal já está coberto: lançar um
 * abastecimento cria o VehicleCost na hora (src/app/combustiveis/actions.ts:113).
 * Esta rotina é o conserto de lançamentos antigos — não precisa ser
 * re-verificada a cada clique, e o painel segue chamando a versão sem represa.
 */
let lastFuelSyncAt = 0;
const FUEL_SYNC_THROTTLE_MS = 60_000;

/** Roda o conserto no máximo uma vez por minuto (por instância). */
export async function ensureVehicleFuelCostsThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastFuelSyncAt < FUEL_SYNC_THROTTLE_MS) return;
  lastFuelSyncAt = now;
  await ensureVehicleFuelCosts();
}

/**
 * Garante que cada nota de combustível ligada a um veículo tenha um VehicleCost
 * (senão o valor some do Lucro/Prejuízo e diverge da equação patrimonial) e que
 * a classificação esteja correta. Idempotente.
 *
 * Regra: o combustível é PÓS-VENDA só se foi abastecido DEPOIS da venda do
 * carro. Abastecido enquanto o carro estava em estoque (ou antes da venda) é
 * CUSTO DO VEÍCULO — entra na margem da venda (postSale=false, centro Veículos).
 * Pós-venda → custo pós-venda (postSale=true, centro Administrativo).
 */
export async function ensureVehicleFuelCosts(): Promise<void> {
  return timed("conserto: custos de combustível", vehicleFuelCosts);
}

async function vehicleFuelCosts(): Promise<void> {
  const fuelPayables = await prisma.payable.findMany({
    where: { category: "COMBUSTIVEL", vehicleId: { not: null } },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      notes: true,
      vehicleId: true,
      costCenterId: true,
      vehicleCost: { select: { id: true, postSale: true } },
    },
  });
  if (fuelPayables.length === 0) return;

  const vehicleIds = [...new Set(fuelPayables.map((p) => p.vehicleId as string))];
  const sales = await prisma.sale.findMany({
    where: { vehicleId: { in: vehicleIds }, status: "CONCLUIDA" },
    select: { vehicleId: true, saleDate: true },
  });
  const saleDateByVehicle = new Map<string, Date>();
  for (const s of sales) {
    const cur = saleDateByVehicle.get(s.vehicleId);
    if (!cur || s.saleDate < cur) saleDateByVehicle.set(s.vehicleId, s.saleDate);
  }

  const [veiculosC, adminC] = await Promise.all([
    prisma.costCenter.findUnique({ where: { key: "VEICULOS" }, select: { id: true } }),
    prisma.costCenter.findUnique({ where: { key: "ADMINISTRATIVO" }, select: { id: true } }),
  ]);

  for (const p of fuelPayables) {
    const vid = p.vehicleId as string;
    const saleDate = saleDateByVehicle.get(vid);
    const isPostSale = !!saleDate && p.dueDate > saleDate;

    if (!p.vehicleCost) {
      await prisma.vehicleCost.create({
        data: {
          vehicleId: vid,
          description: "Combustível",
          category: "OUTROS",
          amount: p.amount,
          date: p.dueDate,
          postSale: isPostSale,
          notes: p.notes,
          payableId: p.id,
        },
      });
    } else if (p.vehicleCost.postSale !== isPostSale) {
      await prisma.vehicleCost.update({
        where: { id: p.vehicleCost.id },
        data: { postSale: isPostSale },
      });
    }

    // Centro de custo coerente com a mesma regra.
    const centerId = isPostSale ? adminC?.id : veiculosC?.id;
    if (centerId && p.costCenterId !== centerId) {
      await prisma.payable.update({ where: { id: p.id }, data: { costCenterId: centerId } });
    }
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
  // Peças em estoque: como o carro parado, é capital imobilizado (ativo), não
  // despesa — o fluxo Peças mostra esse valor no lugar do resultado.
  const [parts, partSales] = await Promise.all([
    prisma.part.findMany({ select: { quantity: true, costPrice: true } }),
    prisma.partSale.findMany({ select: { quantity: true, unitCost: true } }),
  ]);
  const almoxarifado = parts.reduce((s, p) => s + p.quantity * p.costPrice, 0);
  // Despesa do fluxo Peças é o CUSTO DAS PEÇAS VENDIDAS — como no Veículos, onde
  // o carro comprado só vira despesa quando é vendido. A compra que ainda está
  // no estoque é ativo (aparece em "Em estoque"), não despesa.
  const custoPecasVendidas = partSales.reduce((s, v) => s + v.quantity * v.unitCost, 0);
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
    const isPecas = def.key === "PECAS";
    for (const p of c?.payables ?? []) {
      const paid = p.status === "PAGO";
      const veiculoEmEstoque = isVeiculos && p.vehicle && p.vehicle.status !== "VENDIDO";
      if (isPecas) {
        // Peça é como o carro parado: comprada, vira estoque (ativo), não
        // despesa. O que ainda não foi pago aparece à parte, como no Veículos.
        if (!paid) negociadoPendente += p.amount;
      } else if (veiculoEmEstoque) {
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
      despesas: def.key === "PECAS" ? custoPecasVendidas : despesas,
      receitas,
      imobilizado: def.key === "PECAS" ? almoxarifado : imobilizado,
      negociadoPendente,
      resultado: receitas - despesas,
    };
  });
}
