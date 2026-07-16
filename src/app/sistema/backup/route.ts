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
    suppliers,
    customers,
    financialAccounts,
    accountTransfers,
    costCenters,
    vehicles,
    vehicleCosts,
    sales,
    parts,
    partSales,
    payables,
    receivables,
    recurringEntries,
    capitalBeneficiaries,
    capitalTransactions,
    employees,
    fuelEntries,
    purchaseRequests,
    consortiums,
    vehicleAttachments,
  ] = await Promise.all([
    prisma.companySettings.findMany(),
    prisma.user.findMany(),
    prisma.supplier.findMany(),
    prisma.customer.findMany(),
    prisma.financialAccount.findMany(),
    prisma.accountTransfer.findMany(),
    prisma.costCenter.findMany(),
    prisma.vehicle.findMany(),
    prisma.vehicleCost.findMany(),
    prisma.sale.findMany(),
    prisma.part.findMany(),
    prisma.partSale.findMany(),
    prisma.payable.findMany(),
    prisma.receivable.findMany(),
    prisma.recurringEntry.findMany(),
    prisma.capitalBeneficiary.findMany(),
    prisma.capitalTransaction.findMany(),
    prisma.employee.findMany(),
    prisma.fuelEntry.findMany(),
    prisma.purchaseRequest.findMany(),
    prisma.consortium.findMany(),
    prisma.vehicleAttachment.findMany(),
  ]);

  const backup = {
    _meta: { app: "MVP Veículos", version: 1, generatedAt: new Date().toISOString() },
    companySettings,
    users,
    suppliers,
    customers,
    financialAccounts,
    accountTransfers,
    costCenters,
    vehicles,
    vehicleCosts,
    sales,
    parts,
    partSales,
    payables,
    receivables,
    recurringEntries,
    capitalBeneficiaries,
    capitalTransactions,
    employees,
    fuelEntries,
    purchaseRequests,
    consortiums,
    // O arquivo (bytea) vai em base64 para caber no JSON.
    vehicleAttachments: vehicleAttachments.map((a) => ({
      ...a,
      data: Buffer.from(a.data).toString("base64"),
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
