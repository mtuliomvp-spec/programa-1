import "server-only";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { getNeutralAccountId } from "@/lib/accounts";

/**
 * Rotina de REMUNERAÇÃO DE CAPITAL SOBRE O ESTOQUE.
 *
 * Aplica uma taxa X% sobre o CUSTO TOTAL (compra + custos lançados) de veículos
 * em estoque escolhidos. O juro de cada veículo:
 *   1) é incorporado ao CUSTO do veículo (VehicleCost) — reduz a margem quando
 *      ele for vendido;
 *   2) é creditado, ao mesmo tempo, como APORTE de capital para um ou mais
 *      sócios, em percentuais independentes (o rateio soma 100%).
 *
 * Contabilidade via BANCO NEUTRO (que se anula), mantendo o farol equilibrado:
 *   - por veículo: Payable PAGO no Banco Neutro (centro Veículos, vehicleId) +
 *     VehicleCost (amount J_v) → estoqueVeiculosPago += J_total.
 *   - por sócio:   Receivable RECEBIDO no Banco Neutro (centro Capital) +
 *     CapitalTransaction APORTE → saldoCapital += J_total.
 *   - Banco Neutro: −J_total (payables) + J_total (receivables) = 0.
 * Enquanto em estoque o efeito no lucro é zero (estoque +J e capital +J se
 * anulam). Na venda, o custo maior reduz a margem: a remuneração vira custo real
 * e é transferida ao capital dos sócios.
 *
 * Cada execução é um lote (`StockInterestRun`) reversível por estorno.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type StockVehicleForInterest = {
  id: string;
  orderNumber: number;
  brand: string;
  model: string;
  plate: string;
  modelYear: number;
  purchasePrice: number;
  custosLancados: number;
  baseCusto: number;
};

/**
 * Veículos em ESTOQUE (não vendidos e que são patrimônio da loja), com o custo
 * total = compra + Σ custos lançados. Base da remuneração e da tela de seleção.
 */
export async function stockVehiclesForInterest(): Promise<StockVehicleForInterest[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: { not: "VENDIDO" }, intermediation: false },
    select: {
      id: true,
      orderNumber: true,
      brand: true,
      model: true,
      plate: true,
      modelYear: true,
      purchasePrice: true,
      costs: { select: { amount: true } },
    },
    orderBy: { orderNumber: "asc" },
  });
  return vehicles.map((v) => {
    const custosLancados = round2(v.costs.reduce((s, c) => s + c.amount, 0));
    return {
      id: v.id,
      orderNumber: v.orderNumber,
      brand: v.brand,
      model: v.model,
      plate: v.plate,
      modelYear: v.modelYear,
      purchasePrice: v.purchasePrice,
      custosLancados,
      baseCusto: round2(v.purchasePrice + custosLancados),
    };
  });
}

export type StockInterestSplit = { beneficiaryId: string; percent: number };

export type RunStockInterestInput = {
  ratePercent: number;
  vehicleIds: string[];
  splits: StockInterestSplit[];
  date: Date;
  description?: string | null;
  createdBy?: string | null;
};

/**
 * Executa a rotina numa única transação. Valida taxa, veículos (todos em
 * estoque) e o rateio (soma 100% ±0,01). Distribui J_total pelos sócios
 * conforme os percentuais; a última parte absorve o arredondamento para somar
 * exatamente J_total.
 */
export async function runStockInterest(input: RunStockInterestInput): Promise<{ runId: string; totalInterest: number }> {
  const rate = input.ratePercent;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Informe uma taxa de juros maior que zero.");
  }
  if (!input.vehicleIds.length) {
    throw new Error("Escolha ao menos um veículo.");
  }
  const splits = input.splits.filter((s) => s.beneficiaryId && Number.isFinite(s.percent) && s.percent > 0);
  if (!splits.length) {
    throw new Error("Informe ao menos um beneficiário no rateio.");
  }
  const somaPercent = splits.reduce((s, x) => s + x.percent, 0);
  if (Math.abs(somaPercent - 100) > 0.01) {
    throw new Error("A soma dos percentuais do rateio deve ser 100%.");
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: input.vehicleIds } },
    select: {
      id: true,
      brand: true,
      model: true,
      plate: true,
      status: true,
      purchasePrice: true,
      costs: { select: { amount: true } },
    },
  });
  if (vehicles.length !== input.vehicleIds.length) {
    throw new Error("Algum veículo selecionado não foi encontrado.");
  }
  const vendido = vehicles.find((v) => v.status === "VENDIDO");
  if (vendido) {
    throw new Error(`O veículo ${vendido.brand} ${vendido.model} já foi vendido e não está mais em estoque.`);
  }

  // Juro por veículo e total.
  const perVehicle = vehicles.map((v) => {
    const base = v.purchasePrice + v.costs.reduce((s, c) => s + c.amount, 0);
    return { vehicle: v, juro: round2(base * (rate / 100)) };
  });
  const totalInterest = round2(perVehicle.reduce((s, x) => s + x.juro, 0));
  if (totalInterest <= 0) {
    throw new Error("O juro calculado ficou zero. Confira a taxa e os custos dos veículos.");
  }

  const beneficiaryIds = splits.map((s) => s.beneficiaryId);
  const beneficiaries = await prisma.capitalBeneficiary.findMany({
    where: { id: { in: beneficiaryIds } },
    select: { id: true, name: true },
  });
  if (beneficiaries.length !== new Set(beneficiaryIds).size) {
    throw new Error("Algum beneficiário do rateio não foi encontrado.");
  }
  const nameById = new Map(beneficiaries.map((b) => [b.id, b.name]));

  // Rateio do total pelos percentuais; a última parte fecha o arredondamento.
  const shares = splits.map((s, i) =>
    i === splits.length - 1 ? 0 : round2((totalInterest * s.percent) / 100),
  );
  shares[shares.length - 1] = round2(totalInterest - shares.slice(0, -1).reduce((s, x) => s + x, 0));

  const [veiculosCenter, capitalCenter, neutralAccountId] = await Promise.all([
    structuralCenterId("VEICULOS"),
    structuralCenterId("CAPITAL"),
    getNeutralAccountId(),
  ]);

  const date = input.date;
  const rateLabel = `${rate.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

  const runId = await prisma.$transaction(async (tx) => {
    const run = await tx.stockInterestRun.create({
      data: {
        date,
        ratePercent: rate,
        description: input.description || null,
        createdBy: input.createdBy || null,
        totalInterest,
      },
    });

    // Custo: por veículo, incorpora o juro ao custo (Payable PAGO no Banco
    // Neutro + VehicleCost). O payable PAGO de veículo em estoque entra no
    // patrimonial (estoqueVeiculosPago).
    for (const { vehicle, juro } of perVehicle) {
      if (juro <= 0) continue;
      const payable = await tx.payable.create({
        data: {
          costCenterId: veiculosCenter,
          description: `Remuneração de capital ${rateLabel} — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          category: "OUTROS",
          amount: juro,
          dueDate: date,
          paymentDate: date,
          status: "PAGO",
          accountId: neutralAccountId,
          vehicleId: vehicle.id,
          notes: `Rotina de remuneração de capital sobre estoque (lote ${run.id}).`,
        },
      });
      await tx.vehicleCost.create({
        data: {
          vehicleId: vehicle.id,
          description: `Remuneração de capital ${rateLabel}`,
          category: "OUTROS",
          amount: juro,
          date,
          postSale: false,
          payableId: payable.id,
          stockInterestRunId: run.id,
          notes: input.description || null,
        },
      });
    }

    // Capital: distribui o total pelos sócios (Receivable RECEBIDO no Banco
    // Neutro + CapitalTransaction APORTE).
    for (let i = 0; i < splits.length; i++) {
      const share = shares[i];
      if (share <= 0) continue;
      const beneficiaryId = splits[i].beneficiaryId;
      const name = nameById.get(beneficiaryId) ?? "—";
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenter,
          description: `Remuneração de capital sobre estoque — ${name}`,
          category: "OUTROS",
          amount: share,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId: neutralAccountId,
          capitalBeneficiaryId: beneficiaryId,
          notes: `Rotina de remuneração de capital sobre estoque (lote ${run.id}).`,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId,
          kind: "APORTE",
          amount: share,
          date,
          description: input.description || `Remuneração de capital sobre estoque (${rateLabel})`,
          receivableId: receivable.id,
          stockInterestRunId: run.id,
        },
      });
    }

    return run.id;
  });

  return { runId, totalInterest };
}

/**
 * Estorna um lote: bloqueia se algum veículo do lote já foi VENDIDO (o custo já
 * entrou numa venda); senão remove, em transação, os VehicleCosts, os
 * CapitalTransactions e os títulos (payables/receivables) vinculados e o run.
 */
export async function reverseStockInterest(runId: string): Promise<void> {
  const run = await prisma.stockInterestRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("Lote não encontrado.");

  const costs = await prisma.vehicleCost.findMany({
    where: { stockInterestRunId: runId },
    select: { id: true, payableId: true, vehicle: { select: { status: true, brand: true, model: true } } },
  });
  const vendido = costs.find((c) => c.vehicle?.status === "VENDIDO");
  if (vendido) {
    throw new Error(
      `Não é possível estornar: o veículo ${vendido.vehicle?.brand} ${vendido.vehicle?.model} já foi vendido (a remuneração já entrou na margem da venda).`,
    );
  }

  const capitalTx = await prisma.capitalTransaction.findMany({
    where: { stockInterestRunId: runId },
    select: { id: true, receivableId: true },
  });

  await prisma.$transaction(async (tx) => {
    // Custos e seus payables.
    const payableIds = costs.map((c) => c.payableId).filter((x): x is string => !!x);
    await tx.vehicleCost.deleteMany({ where: { stockInterestRunId: runId } });
    if (payableIds.length) await tx.payable.deleteMany({ where: { id: { in: payableIds } } });

    // Aportes e seus receivables.
    const receivableIds = capitalTx.map((c) => c.receivableId).filter((x): x is string => !!x);
    await tx.capitalTransaction.deleteMany({ where: { stockInterestRunId: runId } });
    if (receivableIds.length) await tx.receivable.deleteMany({ where: { id: { in: receivableIds } } });

    await tx.stockInterestRun.delete({ where: { id: runId } });
  });
}

export type StockInterestRunSummary = {
  id: string;
  date: Date;
  ratePercent: number;
  description: string | null;
  createdBy: string | null;
  totalInterest: number;
  vehicleCount: number;
  canReverse: boolean;
};

/** Histórico dos lotes, com contagem de veículos e se ainda pode ser estornado. */
export async function stockInterestHistory(): Promise<StockInterestRunSummary[]> {
  const runs = await prisma.stockInterestRun.findMany({ orderBy: { date: "desc" } });
  const costs = await prisma.vehicleCost.findMany({
    where: { stockInterestRunId: { in: runs.map((r) => r.id) } },
    select: { stockInterestRunId: true, vehicle: { select: { status: true } } },
  });
  return runs.map((r) => {
    const mine = costs.filter((c) => c.stockInterestRunId === r.id);
    const hasSold = mine.some((c) => c.vehicle?.status === "VENDIDO");
    return {
      id: r.id,
      date: r.date,
      ratePercent: r.ratePercent,
      description: r.description,
      createdBy: r.createdBy,
      totalInterest: r.totalInterest,
      vehicleCount: mine.length,
      canReverse: !hasSold,
    };
  });
}
