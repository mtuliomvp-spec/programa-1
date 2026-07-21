import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/guards";
import { toDateInputValue } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import IntermediationForm, { type IntermediationInitial } from "../IntermediationForm";

export const dynamic = "force-dynamic";

export default async function NovoFinanciamentoTerceirosPage({
  searchParams,
}: {
  searchParams: Promise<{ preSale?: string }>;
}) {
  await requireModule("vendas");
  const { preSale: preSaleId } = await searchParams;

  // Edição: carrega a pré-venda em aberto para pré-preencher o formulário.
  let initial: IntermediationInitial | undefined;
  let editingId: string | undefined;
  if (preSaleId) {
    const pre = await prisma.preSale.findUnique({ where: { id: preSaleId } });
    if (pre && pre.saleType === "FINANCIAMENTO_TERCEIROS" && pre.status === "ABERTA") {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: pre.vehicleId } });
      editingId = pre.id;
      initial = {
        customerId: pre.customerId,
        saleDate: toDateInputValue(pre.saleDate),
        ownerName: pre.ownerName ?? undefined,
        ownerDocument: pre.ownerDocument ?? undefined,
        ownerPhone: pre.ownerPhone ?? undefined,
        ownerAddress: pre.ownerAddress ?? undefined,
        buyerBankName: pre.buyerBankName ?? undefined,
        buyerBankAgency: pre.buyerBankAgency ?? undefined,
        buyerBankAccount: pre.buyerBankAccount ?? undefined,
        buyerBankAccountType: pre.buyerBankAccountType ?? undefined,
        buyerPixKey: pre.buyerPixKey ?? undefined,
        brand: vehicle?.brand,
        model: vehicle?.model,
        version: vehicle?.version ?? undefined,
        manufactureYear: vehicle?.manufactureYear,
        modelYear: vehicle?.modelYear,
        plate: vehicle?.plate,
        chassi: vehicle?.chassi ?? undefined,
        color: vehicle?.color ?? undefined,
        km: vehicle?.km,
        fuel: vehicle?.fuel ?? undefined,
        transmission: vehicle?.transmission ?? undefined,
        financingAmount: pre.financingAmount,
        refundAmount: pre.refundAmount,
        financerAccountId: pre.financerAccountId ?? undefined,
        returnLevel: pre.returnLevel,
        takeReturnCommission: pre.takeReturnCommission,
        sellerId: pre.sellerId ?? undefined,
        commissionAmount: pre.commissionAmount,
        transferCharged: pre.transferCharged,
        transferAmount: pre.transferAmount,
        referrals: parseReferrals(pre.referrals),
        installmentsInfoCount: pre.installmentsInfoCount ?? undefined,
        installmentsInfoAmount: pre.installmentsInfoAmount ?? undefined,
        notes: pre.notes ?? undefined,
      };
    }
  }

  const [customers, financers, users] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.financialAccount.findMany({
      where: { active: true, type: "FINANCEIRA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, returnTaxPercent: true, sellerReturnPercent: true },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={editingId ? "Editar pré-venda (financiamento de terceiros)" : "Financiamento de terceiros"}
        description="A loja apenas intermedeia o financiamento de um veículo de terceiro. O carro não entra no estoque."
      />
      <Card>
        <CardHeader title="Dados da operação" />
        <div className="p-5">
          <IntermediationForm
            customers={customers}
            financers={financers}
            users={users}
            initial={initial}
            preSaleId={editingId}
          />
        </div>
      </Card>
    </div>
  );
}
