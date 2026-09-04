import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { toDateInputValue } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import IntermediationForm, { type IntermediationInitial } from "../IntermediationForm";
import { listPayoffBoletos, listIntermediationCrlvs } from "../core";
import { getCompany } from "@/lib/company";
import { RENAVE_PRAZO_PADRAO, avisoIntermediacao, avisoApontamentoLoja } from "@/lib/renave";

export const dynamic = "force-dynamic";

export default async function NovoFinanciamentoTerceirosPage({
  searchParams,
}: {
  searchParams: Promise<{ preSale?: string }>;
}) {
  // Montar/editar a ficha exige a permissão própria do financiamento de terceiros.
  await requireAction("vendas", "terceiros");
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
        // 0 km: a placa guardada é só o marcador técnico — o campo fica vazio.
        plate: vehicle?.zeroKm ? undefined : vehicle?.plate,
        zeroKm: vehicle?.zeroKm,
        manufacturerName: vehicle?.manufacturerName ?? undefined,
        chassi: vehicle?.chassi ?? undefined,
        renavam: vehicle?.renavam ?? undefined,
        color: vehicle?.color ?? undefined,
        km: vehicle?.km,
        fuel: vehicle?.fuel ?? undefined,
        transmission: vehicle?.transmission ?? undefined,
        financingAmount: pre.financingAmount,
        refundAmount: pre.refundAmount,
        refinancing: pre.refinancing,
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
        payoffBank: pre.payoffBank ?? undefined,
        payoffAmount: pre.payoffAmount ?? undefined,
        payoffBarcode: pre.payoffBarcode ?? undefined,
        payoffDueDate: pre.payoffDueDate ? toDateInputValue(pre.payoffDueDate) : undefined,
        payoffBoletos: (await listPayoffBoletos(pre.vehicleId)).map((b) => ({ id: b.id, filename: b.filename })),
        crlvs: (await listIntermediationCrlvs(pre.vehicleId)).map((c) => ({
          id: c.id,
          filename: c.filename,
          description: c.description,
        })),
      };
    }
  }

  const [customers, financers, users] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, document: true, phone: true, address: true },
    }),
    prisma.financialAccount.findMany({
      where: { active: true, type: "FINANCEIRA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, returnTaxPercent: true, sellerReturnPercent: true },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const company = await getCompany();
  const renavePrazo = company.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={editingId ? "Editar pré-venda (financiamento de terceiros)" : "Financiamento de terceiros"}
        description="A loja apenas intermedeia o financiamento de um veículo de terceiro. O carro não entra no estoque."
      />

      {/* Renave: é a rotina mais afetada pela resolução — o carro de terceiro
          fica fora do estoque, e é justamente isso que passa a exigir registro
          eletrônico prévio. Aviso, sem travar nada. */}
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">⚠️ Renave — atenção nesta rotina</p>
        <p className="mt-0.5 text-xs text-amber-800">{avisoIntermediacao(renavePrazo)}</p>
        <p className="mt-1 text-xs text-amber-800">{avisoApontamentoLoja(renavePrazo)}</p>
        <p className="mt-1 text-xs text-amber-800">
          Caminhos possíveis a partir daí: registrar o veículo como <strong>consignado</strong> (contrato
          eletrônico no Renave) ou fazer a <strong>entrada em estoque</strong> antes da operação. Vale
          confirmar com o contador e com a financeira antes do prazo.
        </p>
      </div>
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
