import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { parseReferrals } from "@/lib/referrals";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { computeReturn } from "@/lib/retorno";
import IntermediationPreSaleActions from "./IntermediationPreSaleActions";

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

export default async function IntermediationPreSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  await requireModule("vendas");
  const { id } = await params;
  const { erro } = await searchParams;

  const pre = await prisma.preSale.findUnique({ where: { id } });
  if (!pre || pre.saleType !== "FINANCIAMENTO_TERCEIROS") notFound();
  if (pre.status === "CONVERTIDA" && pre.convertedSaleId) {
    redirect(`/vendas/financiamento-terceiros/${pre.convertedSaleId}`);
  }
  const [vehicle, customer, financerAccount] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: pre.vehicleId } }),
    prisma.customer.findUnique({ where: { id: pre.customerId } }),
    pre.financerAccountId
      ? prisma.financialAccount.findUnique({ where: { id: pre.financerAccountId } })
      : Promise.resolve(null),
  ]);
  if (!vehicle || !customer) notFound();

  const referrals = parseReferrals(pre.referrals);
  const referralsTotal = referrals.reduce((s, r) => s + r.amount, 0);
  const grossProfit = Math.max(0, pre.financingAmount - pre.refundAmount);
  const retorno =
    financerAccount && pre.returnLevel > 0
      ? computeReturn(pre.financingAmount, pre.returnLevel, financerAccount.returnTaxPercent)
      : null;
  const returnSellerCommission =
    pre.takeReturnCommission && retorno && financerAccount && financerAccount.sellerReturnPercent > 0
      ? Math.round(retorno.net * (financerAccount.sellerReturnPercent / 100) * 100) / 100
      : 0;
  const sobraFinanciamento =
    grossProfit - pre.commissionAmount - (pre.transferCharged ? pre.transferAmount : 0) - referralsTotal;
  const sobraRetorno = (retorno ? retorno.net : 0) - returnSellerCommission;
  const netProfit = sobraFinanciamento + sobraRetorno;
  const canceled = pre.status === "CANCELADA";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Financiamento de terceiros — pré-venda"
        description={`${vehicle.brand} ${vehicle.model} · ${vehicle.plate}`}
        action={
          <LinkButton variant="secondary" href={`/vendas/financiamento-terceiros/pre/${pre.id}/contrato`}>
            📄 Contrato de intermediação
          </LinkButton>
        }
      />

      {erro ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {erro}
        </div>
      ) : null}
      {canceled ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Esta pré-venda foi cancelada.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Pré-venda (ficha) — ainda não gera lançamentos. Revise, imprima o contrato e clique em
          <strong> Registrar</strong> para concluir.
        </div>
      )}

      {!canceled ? (
        <IntermediationPreSaleActions
          id={pre.id}
          canRegister={await userCan("vendas", "registrar")}
          canPreSale={await userCan("vendas", "prevenda")}
        />
      ) : null}

      <Card className="mb-4">
        <CardHeader title="Partes" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 p-5 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Vendedor (proprietário):</span> <strong>{pre.ownerName || "—"}</strong></p>
          <p><span className="text-slate-500">Documento:</span> {pre.ownerDocument || "—"}</p>
          <p><span className="text-slate-500">Comprador (cliente):</span> <strong>{customer.name}</strong></p>
          <p><span className="text-slate-500">Financeira:</span> {financerAccount?.name || "—"}</p>
          <p><span className="text-slate-500">Data:</span> {formatDate(pre.saleDate)}</p>
          <p><span className="text-slate-500">Banco do comprador:</span> {pre.buyerBankName || "—"} {pre.buyerBankAgency ? `· Ag ${pre.buyerBankAgency}` : ""} {pre.buyerBankAccount ? `· Cc ${pre.buyerBankAccount}` : ""}</p>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Financiamento" />
        <div className="p-5">
          <Row label="Valor do financiamento (F)" value={formatCurrency(pre.financingAmount)} />
          <Row label="(−) Devolução ao cliente (D)" value={formatCurrency(pre.refundAmount)} tone="rose" />
          <Row label="= Lucro bruto" value={formatCurrency(grossProfit)} />
          {pre.commissionAmount > 0 ? (
            <Row label="(−) Comissão do vendedor" value={formatCurrency(pre.commissionAmount)} tone="rose" />
          ) : null}
          {pre.transferCharged && pre.transferAmount > 0 ? (
            <Row label="(−) Transferência (DETRAN)" value={formatCurrency(pre.transferAmount)} tone="rose" />
          ) : null}
          {referralsTotal > 0 ? (
            <Row label="(−) Indicações" value={formatCurrency(referralsTotal)} tone="rose" />
          ) : null}
          <div className="mt-2 border-t border-slate-300 pt-2">
            <Row label="= Sobra do financiamento" value={formatCurrency(sobraFinanciamento)} tone="green" />
          </div>
        </div>
      </Card>

      {retorno ? (
        <Card className="mb-4">
          <CardHeader title="Retorno da financeira (previsto)" />
          <div className="p-5">
            <Row label="Retorno líquido da financeira" value={formatCurrency(retorno.net)} tone="green" />
            {returnSellerCommission > 0 ? (
              <Row label="(−) Comissão do retorno" value={formatCurrency(returnSellerCommission)} tone="rose" />
            ) : null}
            <div className="mt-2 border-t border-slate-300 pt-2">
              <Row label="= Sobra do retorno" value={formatCurrency(sobraRetorno)} tone="green" />
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <div className="p-5">
          <Row label="Lucro sobre financiamento de terceiros" value={formatCurrency(netProfit)} tone="green" />
        </div>
      </Card>
    </div>
  );
}
