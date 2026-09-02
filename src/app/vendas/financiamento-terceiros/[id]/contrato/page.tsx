import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import IntermediationContractDocument from "@/components/IntermediationContractDocument";

export const dynamic = "force-dynamic";

export default async function ContratoIntermediacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { vehicle: true, customer: true, financerAccount: { select: { name: true } } },
  });
  if (!sale || sale.saleType !== "FINANCIAMENTO_TERCEIROS") notFound();

  const company = await getCompany();

  return (
    <IntermediationContractDocument
      company={company}
      seller={{
        name: sale.ownerName || "—",
        document: sale.ownerDocument,
        phone: sale.ownerPhone,
        address: sale.ownerAddress,
      }}
      buyer={{
        name: sale.customer.name,
        document: sale.customer.document,
        phone: sale.customer.phone,
        address: sale.customer.address,
      }}
      buyerBank={{
        name: sale.buyerBankName,
        agency: sale.buyerBankAgency,
        account: sale.buyerBankAccount,
        accountType: sale.buyerBankAccountType,
        pixKey: sale.buyerPixKey,
      }}
      vehicle={sale.vehicle}
      number={sale.orderNumber}
      date={sale.saleDate}
      financingAmount={sale.financingAmount}
      refundAmount={sale.refundAmount}
      refinancing={sale.refinancing}
      financerName={sale.financerAccount?.name ?? null}
      installmentsInfo={
        sale.installmentsInfoCount && sale.installmentsInfoAmount
          ? { count: sale.installmentsInfoCount, amount: sale.installmentsInfoAmount }
          : null
      }
      payoff={
        sale.payoffAmount
          ? { bank: sale.payoffBank, amount: sale.payoffAmount, barcode: sale.payoffBarcode, dueDate: sale.payoffDueDate }
          : null
      }
      backHref={`/vendas/financiamento-terceiros/${sale.id}`}
    />
  );
}
