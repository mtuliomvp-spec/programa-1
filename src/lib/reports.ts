import { prisma } from "@/lib/prisma";
import type { CategoriaPagar } from "@prisma/client";

/**
 * Consultas dos relatórios gerenciais: DRE mensal, lucro por veículo,
 * aging de estoque e despesas por categoria.
 *
 * Convenções:
 * - Receitas/custos de venda seguem regime de competência (data da venda).
 * - Despesas usam a data de vencimento da conta a pagar.
 * - Custos de veículos (vehicle_costs) entram no custo do veículo vendido,
 *   nunca em despesas — a conta a pagar gerada por eles é excluída das
 *   despesas para não contar duas vezes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

function monthLabel(date: Date) {
  const month = date
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  const year = date.toLocaleDateString("pt-BR", { year: "2-digit", timeZone: "UTC" });
  return `${month}/${year}`;
}

export function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

// ---------------------------------------------------------------------------
// DRE mensal simplificado
// ---------------------------------------------------------------------------

export type DreMonth = {
  label: string;
  receitaVeiculos: number;
  receitaPecas: number;
  receitaTotal: number;
  custoVeiculos: number;
  custoPecas: number;
  custoTotal: number;
  lucroBruto: number;
  despesas: number;
  comissoes: number;
  lucroLiquido: number;
  veiculosVendidos: number;
};

export async function getMonthlyDre(months = 12): Promise<DreMonth[]> {
  const { start: rangeStart } = monthRange(months - 1);
  const { end: rangeEnd } = monthRange(0);

  const [sales, partSales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", saleDate: { gte: rangeStart, lt: rangeEnd } },
      include: { vehicle: { include: { costs: true } } },
    }),
    prisma.partSale.findMany({
      where: { saleDate: { gte: rangeStart, lt: rangeEnd } },
      include: { part: { select: { costPrice: true } } },
    }),
    prisma.payable.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        category: { in: ["DESPESA_OPERACIONAL", "COMISSAO", "OUTROS"] },
        vehicleCost: null, // custos de veículo já entram no custo da venda
        vehicleId: null, // idem para contas manuais ligadas a veículos
      },
      select: { amount: true, dueDate: true, category: true },
    }),
  ]);

  const result: DreMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = monthRange(i);
    const monthSales = sales.filter((s) => s.saleDate >= start && s.saleDate < end);
    const monthPartSales = partSales.filter((p) => p.saleDate >= start && p.saleDate < end);
    const monthExpenses = expenses.filter((e) => e.dueDate >= start && e.dueDate < end);

    const receitaVeiculos = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const receitaPecas = monthPartSales.reduce((sum, p) => sum + p.totalAmount, 0);
    const custoVeiculos = monthSales.reduce(
      (sum, s) =>
        sum +
        s.vehicle.purchasePrice +
        s.vehicle.costs.reduce((cs, c) => cs + c.amount, 0),
      0,
    );
    const custoPecas = monthPartSales.reduce(
      (sum, p) => sum + p.quantity * p.part.costPrice,
      0,
    );
    const comissoes = monthExpenses
      .filter((e) => e.category === "COMISSAO")
      .reduce((sum, e) => sum + e.amount, 0);
    const despesas = monthExpenses
      .filter((e) => e.category !== "COMISSAO")
      .reduce((sum, e) => sum + e.amount, 0);

    const receitaTotal = receitaVeiculos + receitaPecas;
    const custoTotal = custoVeiculos + custoPecas;
    const lucroBruto = receitaTotal - custoTotal;

    result.push({
      label: monthLabel(start),
      receitaVeiculos,
      receitaPecas,
      receitaTotal,
      custoVeiculos,
      custoPecas,
      custoTotal,
      lucroBruto,
      despesas,
      comissoes,
      lucroLiquido: lucroBruto - despesas - comissoes,
      veiculosVendidos: monthSales.length,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Lucro por veículo vendido
// ---------------------------------------------------------------------------

export type VehicleProfitRow = {
  saleId: string;
  vehicleId: string;
  vehicleLabel: string;
  plate: string;
  saleDate: Date;
  purchasePrice: number;
  extraCosts: number;
  totalCost: number;
  saleAmount: number;
  profit: number;
  marginPct: number;
  daysInStock: number;
};

export async function getVehicleProfitReport(): Promise<VehicleProfitRow[]> {
  const sales = await prisma.sale.findMany({
    where: { status: "CONCLUIDA" },
    include: { vehicle: { include: { costs: true } } },
    orderBy: { saleDate: "desc" },
  });

  return sales.map((s) => {
    const extraCosts = s.vehicle.costs.reduce((sum, c) => sum + c.amount, 0);
    const totalCost = s.vehicle.purchasePrice + extraCosts;
    const profit = s.totalAmount - totalCost;
    return {
      saleId: s.id,
      vehicleId: s.vehicleId,
      vehicleLabel: `${s.vehicle.brand} ${s.vehicle.model}`,
      plate: s.vehicle.plate,
      saleDate: s.saleDate,
      purchasePrice: s.vehicle.purchasePrice,
      extraCosts,
      totalCost,
      saleAmount: s.totalAmount,
      profit,
      marginPct: s.totalAmount > 0 ? (profit / s.totalAmount) * 100 : 0,
      daysInStock: daysBetween(s.vehicle.entryDate, s.saleDate),
    };
  });
}

// ---------------------------------------------------------------------------
// Aging do estoque (tempo parado)
// ---------------------------------------------------------------------------

export type AgingBucket = {
  label: string;
  minDays: number;
  count: number;
  invested: number;
  saleValue: number;
};

export type AgingVehicleRow = {
  id: string;
  vehicleLabel: string;
  plate: string;
  entryDate: Date;
  daysInStock: number;
  invested: number;
  salePrice: number;
  status: "ESTOQUE" | "RESERVADO";
};

export async function getStockAging(): Promise<{
  buckets: AgingBucket[];
  vehicles: AgingVehicleRow[];
}> {
  const now = new Date();
  const inStock = await prisma.vehicle.findMany({
    where: { status: { in: ["ESTOQUE", "RESERVADO"] } },
    include: { costs: true },
    orderBy: { entryDate: "asc" },
  });

  const vehicles: AgingVehicleRow[] = inStock.map((v) => ({
    id: v.id,
    vehicleLabel: `${v.brand} ${v.model}`,
    plate: v.plate,
    entryDate: v.entryDate,
    daysInStock: daysBetween(v.entryDate, now),
    invested: v.purchasePrice + v.costs.reduce((sum, c) => sum + c.amount, 0),
    salePrice: v.salePrice,
    status: v.status as "ESTOQUE" | "RESERVADO",
  }));

  const bucketDefs = [
    { label: "0 a 30 dias", min: 0, max: 30 },
    { label: "31 a 60 dias", min: 31, max: 60 },
    { label: "61 a 90 dias", min: 61, max: 90 },
    { label: "Mais de 90 dias", min: 91, max: Infinity },
  ];

  const buckets: AgingBucket[] = bucketDefs.map((b) => {
    const items = vehicles.filter((v) => v.daysInStock >= b.min && v.daysInStock <= b.max);
    return {
      label: b.label,
      minDays: b.min,
      count: items.length,
      invested: items.reduce((sum, v) => sum + v.invested, 0),
      saleValue: items.reduce((sum, v) => sum + v.salePrice, 0),
    };
  });

  return { buckets, vehicles };
}

// ---------------------------------------------------------------------------
// Despesas por categoria
// ---------------------------------------------------------------------------

export const PAYABLE_CATEGORY_LABEL: Record<CategoriaPagar, string> = {
  COMPRA_VEICULO: "Compra de veículos",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  COMISSAO: "Comissões",
  OUTROS: "Outros",
};

export type ExpenseCategoryRow = {
  category: CategoriaPagar;
  label: string;
  total: number;
  paid: number;
  pending: number;
  count: number;
};

export async function getExpensesByCategory(months = 12): Promise<{
  rows: ExpenseCategoryRow[];
  total: number;
  from: Date;
}> {
  const { start } = monthRange(months - 1);
  const payables = await prisma.payable.findMany({
    where: { dueDate: { gte: start } },
    select: { category: true, amount: true, status: true },
  });

  const categories = Object.keys(PAYABLE_CATEGORY_LABEL) as CategoriaPagar[];
  const rows: ExpenseCategoryRow[] = categories
    .map((category) => {
      const items = payables.filter((p) => p.category === category);
      const paid = items
        .filter((p) => p.status === "PAGO")
        .reduce((sum, p) => sum + p.amount, 0);
      const total = items.reduce((sum, p) => sum + p.amount, 0);
      return {
        category,
        label: PAYABLE_CATEGORY_LABEL[category],
        total,
        paid,
        pending: total - paid,
        count: items.length,
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.total - a.total);

  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.total, 0),
    from: start,
  };
}

// ---------------------------------------------------------------------------
// Indicadores extras do dashboard
// ---------------------------------------------------------------------------

export async function getPerformanceStats() {
  const { start: monthStart, end: monthEnd } = monthRange(0);
  const now = new Date();

  const [monthSales, inStock] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", saleDate: { gte: monthStart, lt: monthEnd } },
      include: { vehicle: { include: { costs: true } } },
    }),
    prisma.vehicle.findMany({
      where: { status: { in: ["ESTOQUE", "RESERVADO"] } },
      include: { costs: true },
    }),
  ]);

  const profitThisMonth = monthSales.reduce((sum, s) => {
    const cost =
      s.vehicle.purchasePrice + s.vehicle.costs.reduce((cs, c) => cs + c.amount, 0);
    return sum + (s.totalAmount - cost);
  }, 0);

  const avgTicket =
    monthSales.length > 0
      ? monthSales.reduce((sum, s) => sum + s.totalAmount, 0) / monthSales.length
      : 0;

  const investedInStock = inStock.reduce(
    (sum, v) => sum + v.purchasePrice + v.costs.reduce((cs, c) => cs + c.amount, 0),
    0,
  );

  const avgDaysInStock =
    inStock.length > 0
      ? Math.round(
          inStock.reduce((sum, v) => sum + daysBetween(v.entryDate, now), 0) /
            inStock.length,
        )
      : 0;

  return { profitThisMonth, avgTicket, investedInStock, avgDaysInStock };
}
