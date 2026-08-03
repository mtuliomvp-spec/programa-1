import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { toDateInputValue } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import SaleForm, { type SaleFormInitial } from "../SaleForm";

export const dynamic = "force-dynamic";

export default async function NovaVendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string; preSale?: string }>;
}) {
  const { vehicleId, preSale: preSaleId } = await searchParams;
  const user = await getSessionUser();

  // Edição de uma pré-venda: carrega os dados para pré-preencher o formulário.
  let initial: SaleFormInitial | undefined;
  if (preSaleId) {
    const pre = await prisma.preSale.findUnique({ where: { id: preSaleId } });
    if (pre && pre.status !== "CONVERTIDA") {
      initial = {
        vehicleId: pre.vehicleId,
        customerId: pre.customerId,
        saleDate: toDateInputValue(pre.saleDate),
        totalAmount: pre.totalAmount,
        paymentMethod: pre.paymentMethod,
        downPayment: pre.downPayment,
        installmentsCount: pre.installmentsCount,
        financerAccountId: pre.financerAccountId ?? undefined,
        financedAmount: pre.financedAmount ?? undefined,
        returnLevel: pre.returnLevel ?? 0,
        sellerName: pre.sellerName ?? undefined,
        sellerId: pre.sellerId ?? undefined,
        commissionAmount: pre.commissionAmount ?? undefined,
        referrals: parseReferrals(pre.referrals),
        transferCharged: pre.transferCharged,
        transferAmount: pre.transferAmount ?? undefined,
        takeReturnCommission: pre.takeReturnCommission,
        viaPaidTraffic: pre.viaPaidTraffic,
        installmentsInfoCount: pre.installmentsInfoCount ?? undefined,
        installmentsInfoAmount: pre.installmentsInfoAmount ?? undefined,
        notes: pre.notes ?? undefined,
        ownerRefundToCapital: pre.ownerRefundToCapital,
        ownerRefundBeneficiaryId: pre.ownerRefundBeneficiaryId ?? undefined,
        buyerBankName: pre.buyerBankName ?? undefined,
        buyerBankAgency: pre.buyerBankAgency ?? undefined,
        buyerBankAccount: pre.buyerBankAccount ?? undefined,
        buyerBankAccountType: pre.buyerBankAccountType ?? undefined,
        buyerPixKey: pre.buyerPixKey ?? undefined,
        tradeIn: pre.tradeIn,
        tiPlate: pre.tiPlate ?? undefined,
        tiBrand: pre.tiBrand ?? undefined,
        tiModel: pre.tiModel ?? undefined,
        tiVersion: pre.tiVersion ?? undefined,
        tiManufactureYear: pre.tiManufactureYear ?? undefined,
        tiModelYear: pre.tiModelYear ?? undefined,
        tiColor: pre.tiColor ?? undefined,
        tiKm: pre.tiKm ?? undefined,
        tiFuel: pre.tiFuel ?? undefined,
        tiTransmission: pre.tiTransmission ?? undefined,
        tiChassi: pre.tiChassi ?? undefined,
        tiNegotiated: pre.tiNegotiated ?? undefined,
        tiPayoff: pre.tiPayoff ?? undefined,
        tiPayoffTo: pre.tiPayoffTo ?? undefined,
        tiDebts: pre.tiDebts ?? undefined,
        tiSupplierName: pre.tiSupplierName ?? undefined,
      };
    }
  }
  const [vehicles, customers, financers, users, beneficiaries] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { in: ["ESTOQUE", "RESERVADO"] }, intermediation: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        brand: true,
        model: true,
        plate: true,
        salePrice: true,
        consigned: true,
        ownerRefundAmount: true,
        payoffAmount: true,
        debtsAmount: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.financialAccount.findMany({
      where: { active: true, type: "FINANCEIRA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, returnTaxPercent: true, sellerReturnPercent: true },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Todos os beneficiários do capital (destino opcional da devolução do consignado).
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Sinais / entradas antecipadas já recebidas por veículo (abatidas na venda).
  const advanceRows = await prisma.receivable.groupBy({
    by: ["vehicleId"],
    where: { saleId: null, status: "RECEBIDO", vehicleId: { in: vehicles.map((v) => v.id) } },
    _sum: { amount: true },
  });
  const advances: Record<string, number> = {};
  for (const r of advanceRows) if (r.vehicleId) advances[r.vehicleId] = r._sum.amount ?? 0;

  // Pré-vendas em aberto por veículo: marca o item no seletor ("pré-vendido nº").
  const openPreSales = await prisma.preSale.findMany({
    where: { status: "ABERTA", vehicleId: { in: vehicles.map((v) => v.id) } },
    select: { vehicleId: true, number: true },
    orderBy: { number: "asc" },
  });
  const preSaleByVehicle = new Map<string, number>();
  for (const ps of openPreSales) if (!preSaleByVehicle.has(ps.vehicleId)) preSaleByVehicle.set(ps.vehicleId, ps.number);
  const vehiclesWithTag = vehicles.map((v) => {
    const n = preSaleByVehicle.get(v.id);
    return { ...v, preSaleTag: n ? `pré-vendido nº ${String(n).padStart(4, "0")}` : undefined };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={initial ? "Editar pré-venda" : "Nova venda"}
        description={
          initial
            ? "Ajuste os dados da negociação e gere a ficha atualizada"
            : "Monte a negociação e gere a pré-venda (ficha de negócio) para revisar"
        }
      />
      <Card>
        <CardHeader title="Dados da negociação" />
        <div className="p-5">
          <SaleForm
            vehicles={vehiclesWithTag}
            customers={customers}
            financers={financers}
            users={users}
            beneficiaries={beneficiaries}
            advances={advances}
            preselectedVehicleId={vehicleId}
            currentUserId={user?.id}
            initial={initial}
            preSaleId={initial ? preSaleId : undefined}
          />
        </div>
      </Card>
    </div>
  );
}
