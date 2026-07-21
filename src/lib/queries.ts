import { prisma } from "@/lib/prisma";
import { effectivePayableStatus, effectiveReceivableStatus } from "@/lib/status";

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

export async function getDashboardStats() {
  const { start: monthStart, end: monthEnd } = monthRange(0);

  const [
    vehiclesInStock,
    vehiclesSoldThisMonth,
    partsLowStock,
    payablesPending,
    receivablesPending,
    receivedThisMonth,
    paidThisMonth,
  ] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { in: ["ESTOQUE", "RESERVADO"] }, intermediation: false },
      select: { salePrice: true, status: true },
    }),
    prisma.sale.findMany({
      where: {
        status: "CONCLUIDA",
        saleDate: { gte: monthStart, lt: monthEnd },
      },
      select: { totalAmount: true },
    }),
    prisma.part.findMany({
      select: { id: true, quantity: true, minQuantity: true },
    }),
    prisma.payable.findMany({
      where: { status: { not: "PAGO" } },
      select: { amount: true, dueDate: true, status: true },
    }),
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" } },
      select: { amount: true, dueDate: true, status: true },
    }),
    prisma.receivable.aggregate({
      where: { status: "RECEBIDO", receivedDate: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.payable.aggregate({
      where: { status: "PAGO", paymentDate: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
  ]);

  const payablesOverdue = payablesPending.filter(
    (p) => effectivePayableStatus(p.status, p.dueDate) === "ATRASADO",
  );
  const receivablesOverdue = receivablesPending.filter(
    (r) => effectiveReceivableStatus(r.status, r.dueDate) === "ATRASADO",
  );

  return {
    vehiclesInStockCount: vehiclesInStock.length,
    vehiclesInStockValue: vehiclesInStock.reduce((sum, v) => sum + v.salePrice, 0),
    vehiclesReservedCount: vehiclesInStock.filter((v) => v.status === "RESERVADO").length,
    salesThisMonthCount: vehiclesSoldThisMonth.length,
    salesThisMonthValue: vehiclesSoldThisMonth.reduce((sum, s) => sum + s.totalAmount, 0),
    partsLowStockCount: partsLowStock.filter((p) => p.quantity <= p.minQuantity).length,
    payablesPendingTotal: payablesPending.reduce((sum, p) => sum + p.amount, 0),
    payablesPendingCount: payablesPending.length,
    payablesOverdueTotal: payablesOverdue.reduce((sum, p) => sum + p.amount, 0),
    payablesOverdueCount: payablesOverdue.length,
    receivablesPendingTotal: receivablesPending.reduce((sum, r) => sum + r.amount, 0),
    receivablesPendingCount: receivablesPending.length,
    receivablesOverdueTotal: receivablesOverdue.reduce((sum, r) => sum + r.amount, 0),
    receivablesOverdueCount: receivablesOverdue.length,
    cashBalanceThisMonth:
      (receivedThisMonth._sum.amount || 0) - (paidThisMonth._sum.amount || 0),
    receivedThisMonth: receivedThisMonth._sum.amount || 0,
    paidThisMonth: paidThisMonth._sum.amount || 0,
  };
}

export async function getUpcomingDue(days = 7) {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({
      where: { status: { not: "PAGO" }, dueDate: { lte: limit } },
      include: { supplier: true, vehicle: true, part: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" }, dueDate: { lte: limit } },
      include: { customer: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
  ]);

  return { payables, receivables };
}

export async function getCashFlowLastMonths(months = 6) {
  const results = [];
  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = monthRange(i);
    const [received, paid] = await Promise.all([
      prisma.receivable.aggregate({
        where: { status: "RECEBIDO", receivedDate: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      prisma.payable.aggregate({
        where: { status: "PAGO", paymentDate: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
    ]);
    results.push({
      label: start.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }),
      entradas: received._sum.amount || 0,
      saidas: paid._sum.amount || 0,
    });
  }
  return results;
}
