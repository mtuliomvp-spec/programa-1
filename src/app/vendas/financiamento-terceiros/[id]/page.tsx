import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { parseReferrals } from "@/lib/referrals";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { cancelIntermediationAction } from "../actions";
import { listPayoffBoletos, listIntermediationCrlvs, identificacaoVeiculo } from "../core";
import PayoffCard from "../PayoffCard";
import CrlvLine from "../CrlvLine";
import ClientPhotoCapture from "@/app/estoque/[id]/ClientPhotoCapture";

export const dynamic = "force-dynamic";

function Row({ label, value, tone }: { label: string; value: string; tone?: "green" | "rose" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span
        className={`tabular-nums ${tone === "green" ? "text-emerald-700 font-semibold" : tone === "rose" ? "text-rose-600" : "text-slate-800"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function FinanciamentoTerceirosDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("vendas");
  const { id } = await params;

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { vehicle: true, customer: true, financerAccount: true },
  });
  if (!sale || sale.saleType !== "FINANCIAMENTO_TERCEIROS") notFound();
  const [boletos, crlvs] = await Promise.all([
    listPayoffBoletos(sale.vehicleId),
    listIntermediationCrlvs(sale.vehicleId),
  ]);

  const referrals = parseReferrals(sale.referrals);
  const referralsTotal = referrals.reduce((s, r) => s + r.amount, 0);
  // No refinanciamento a loja não fica com F − D: a financeira paga F direto ao
  // financiado (repasse = F, lucro bruto = 0). A receita da loja é só o retorno.
  const grossProfit = sale.refinancing ? 0 : Math.max(0, sale.financingAmount - sale.refundAmount);
  const devolucaoDisplay = sale.refinancing ? sale.financingAmount : sale.refundAmount;
  const sobraFinanciamento =
    grossProfit -
    sale.commissionAmount -
    (sale.transferCharged ? sale.transferAmount : 0) -
    referralsTotal;
  const sobraRetorno = sale.returnNet - sale.returnCommissionAmount;
  const netProfit = sobraFinanciamento + sobraRetorno;
  const canCancel = await userCan("vendas", "cancelar");
  const canceled = sale.status === "CANCELADA";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Financiamento de terceiros${sale.refinancing ? " (Refinanciamento)" : ""}`}
        description={`${sale.vehicle.brand} ${sale.vehicle.model} · ${identificacaoVeiculo(sale.vehicle)}`}
        action={
          <LinkButton variant="secondary" href={`/vendas/financiamento-terceiros/${sale.id}/contrato`}>
            📄 Contrato de intermediação
          </LinkButton>
        }
      />

      {canceled ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Esta operação foi cancelada — os lançamentos foram revertidos.
        </div>
      ) : null}

      <Card className="mb-4">
        <CardHeader title="Partes" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 p-5 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Vendedor (proprietário):</span> <strong>{sale.ownerName || "—"}</strong></p>
          <p><span className="text-slate-500">Documento:</span> {sale.ownerDocument || "—"}</p>
          <p><span className="text-slate-500">Comprador (cliente):</span> <strong>{sale.customer.name}</strong></p>
          <p><span className="text-slate-500">Financeira:</span> {sale.financerAccount?.name || "—"}</p>
          <p><span className="text-slate-500">Data:</span> {formatDate(sale.saleDate)}</p>
          <CrlvLine crlvs={crlvs} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Financiamento" />
        <div className="p-5">
          <Row label="Valor do financiamento (F)" value={formatCurrency(sale.financingAmount)} />
          <Row
            label={sale.refinancing ? "(−) Devolução ao financiado (D)" : "(−) Devolução ao cliente (D)"}
            value={formatCurrency(devolucaoDisplay)}
            tone="rose"
          />
          <Row label="= Lucro bruto" value={formatCurrency(grossProfit)} />
          {sale.commissionAmount > 0 ? (
            <Row label="(−) Comissão do vendedor" value={formatCurrency(sale.commissionAmount)} tone="rose" />
          ) : null}
          {sale.transferCharged && sale.transferAmount > 0 ? (
            <Row label="(−) Transferência (DETRAN)" value={formatCurrency(sale.transferAmount)} tone="rose" />
          ) : null}
          {referralsTotal > 0 ? (
            <Row label="(−) Indicações" value={formatCurrency(referralsTotal)} tone="rose" />
          ) : null}
          <div className="mt-2 border-t border-slate-300 pt-2">
            <Row label="= Sobra do financiamento" value={formatCurrency(sobraFinanciamento)} tone="green" />
          </div>
        </div>
      </Card>

      {sale.returnNet > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Retorno da financeira" />
          <div className="p-5">
            <Row label="Retorno líquido da financeira" value={formatCurrency(sale.returnNet)} tone="green" />
            {sale.returnCommissionAmount > 0 ? (
              <Row label="(−) Comissão do retorno" value={formatCurrency(sale.returnCommissionAmount)} tone="rose" />
            ) : null}
            <div className="mt-2 border-t border-slate-300 pt-2">
              <Row label="= Sobra do retorno" value={formatCurrency(sobraRetorno)} tone="green" />
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="mt-4">
        <div className="p-5">
          <Row label="Lucro sobre financiamento de terceiros" value={formatCurrency(netProfit)} tone="green" />
        </div>
      </Card>

      <PayoffCard
        className="mt-4"
        payoff={{ bank: sale.payoffBank, amount: sale.payoffAmount, barcode: sale.payoffBarcode, dueDate: sale.payoffDueDate }}
        boletos={boletos}
      />

      <Card className="mt-4">
        <CardHeader
          title="Foto do cliente (antifraude)"
          description="Registre o comprador com data/hora e localização — prova contra alegação de fraude. Fica no prontuário do veículo."
        />
        <ClientPhotoCapture vehicleId={sale.vehicle.id} />
      </Card>

      {canCancel && !canceled ? (
        <form action={cancelIntermediationAction.bind(null, sale.id)} className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            Cancelar operação
          </button>
        </form>
      ) : null}
    </div>
  );
}
