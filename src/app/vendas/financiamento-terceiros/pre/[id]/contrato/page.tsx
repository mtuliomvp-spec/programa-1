import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import IntermediationContractDocument from "@/components/IntermediationContractDocument";

export const dynamic = "force-dynamic";

export default async function ContratoIntermediacaoPrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pre = await prisma.preSale.findUnique({ where: { id } });
  if (!pre || pre.saleType !== "FINANCIAMENTO_TERCEIROS") notFound();

  const [company, vehicle, customer, financer] = await Promise.all([
    getCompany(),
    prisma.vehicle.findUnique({ where: { id: pre.vehicleId } }),
    prisma.customer.findUnique({ where: { id: pre.customerId } }),
    pre.financerAccountId
      ? prisma.financialAccount.findUnique({ where: { id: pre.financerAccountId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  if (!vehicle || !customer) notFound();

  return (
    <IntermediationContractDocument
      company={company}
      seller={{
        name: pre.ownerName || "—",
        document: pre.ownerDocument,
        phone: pre.ownerPhone,
        address: pre.ownerAddress,
      }}
      buyer={{
        name: customer.name,
        document: customer.document,
        phone: customer.phone,
        address: customer.address,
      }}
      buyerBank={{
        name: pre.buyerBankName,
        agency: pre.buyerBankAgency,
        account: pre.buyerBankAccount,
        accountType: pre.buyerBankAccountType,
        pixKey: pre.buyerPixKey,
      }}
      vehicle={vehicle}
      number={pre.number}
      date={pre.saleDate}
      financingAmount={pre.financingAmount}
      refundAmount={pre.refundAmount}
      financerName={financer?.name ?? null}
      installmentsInfo={
        pre.installmentsInfoCount && pre.installmentsInfoAmount
          ? { count: pre.installmentsInfoCount, amount: pre.installmentsInfoAmount }
          : null
      }
      backHref={`/vendas/financiamento-terceiros/pre/${pre.id}`}
    />
  );
}
