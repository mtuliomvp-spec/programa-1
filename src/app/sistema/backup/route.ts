import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Backup completo do sistema em JSON (somente ADMIN). Baixa um arquivo com
 * todas as tabelas, para guardar ou restaurar depois.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const [
    companySettings,
    users,
    profiles,
    suppliers,
    customers,
    financialAccounts,
    accountTransfers,
    costCenters,
    vehicles,
    vehicleCosts,
    preSales,
    sales,
    parts,
    partSales,
    payables,
    receivables,
    recurringEntries,
    capitalBeneficiaries,
    investmentAllocations,
    capitalTransactions,
    stockInterestRuns,
    monthlyClosings,
    employees,
    fuelEntries,
    purchaseRequests,
    consortiums,
    cashboxSessions,
    launchCategories,
    vehicleAttachments,
    companyDocuments,
  ] = await Promise.all([
    prisma.companySettings.findMany(),
    prisma.user.findMany(),
    prisma.profile.findMany(),
    prisma.supplier.findMany(),
    prisma.customer.findMany(),
    prisma.financialAccount.findMany(),
    prisma.accountTransfer.findMany(),
    prisma.costCenter.findMany(),
    prisma.vehicle.findMany(),
    prisma.vehicleCost.findMany(),
    prisma.preSale.findMany(),
    prisma.sale.findMany(),
    prisma.part.findMany(),
    prisma.partSale.findMany(),
    prisma.payable.findMany(),
    prisma.receivable.findMany(),
    prisma.recurringEntry.findMany(),
    prisma.capitalBeneficiary.findMany(),
    prisma.investmentAllocation.findMany(),
    prisma.capitalTransaction.findMany(),
    prisma.stockInterestRun.findMany(),
    prisma.monthlyClosing.findMany(),
    prisma.employee.findMany(),
    prisma.fuelEntry.findMany(),
    prisma.purchaseRequest.findMany(),
    prisma.consortium.findMany(),
    prisma.cashboxSession.findMany(),
    prisma.launchCategory.findMany(),
    prisma.vehicleAttachment.findMany(),
    prisma.companyDocument.findMany(),
  ]);

  const backup = {
    _meta: { app: "MVP Veículos", version: 2, generatedAt: new Date().toISOString() },
    companySettings,
    users,
    profiles,
    suppliers,
    customers,
    financialAccounts,
    accountTransfers,
    costCenters,
    vehicles,
    vehicleCosts,
    preSales,
    sales,
    parts,
    partSales,
    payables,
    receivables,
    recurringEntries,
    capitalBeneficiaries,
    investmentAllocations,
    capitalTransactions,
    stockInterestRuns,
    monthlyClosings,
    employees,
    fuelEntries,
    purchaseRequests,
    consortiums,
    cashboxSessions,
    launchCategories,
    // O arquivo (bytea) vai em base64 para caber no JSON.
    vehicleAttachments: vehicleAttachments.map((a) => ({
      ...a,
      data: Buffer.from(a.data).toString("base64"),
    })),
    companyDocuments: companyDocuments.map((d) => ({
      ...d,
      data: Buffer.from(d.data).toString("base64"),
    })),
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="backup-mvp-veiculos-${stamp}.json"`,
    },
  });
}
