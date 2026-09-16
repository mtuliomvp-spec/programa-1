import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { parseReferrals } from "@/lib/referrals";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  houseNameKeys,
  situacaoDocumental,
  seloCrlv,
  ORCAMENTO_TRANSFERENCIA_RE,
} from "@/lib/doc-owner";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { cancelIntermediationAction } from "../actions";
import {
  listPayoffBoletos,
  listIntermediationCrlvs,
  identificacaoVeiculo,
  PAYOFF_BOLETO_PREFIX,
  NOTA_VEICULO_PREFIX,
} from "../core";
import PayoffCard from "../PayoffCard";
import CrlvLine from "../CrlvLine";
import ClientPhotoCapture from "@/app/estoque/[id]/ClientPhotoCapture";
import VehicleTransferQuote from "@/app/estoque/[id]/VehicleTransferQuote";
import VehicleAtpv from "@/app/estoque/[id]/VehicleAtpv";
import VehicleAttachments from "@/app/estoque/[id]/VehicleAttachments";
import SaleTransferSetting from "@/app/estoque/[id]/SaleTransferSetting";
import TransferInProgressSetting from "@/app/estoque/[id]/TransferInProgressSetting";

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
    include: {
      // O veículo é de terceiro, mas a documentação corre igual à de um vendido
      // do estoque — e quem responde por ela são os anexos, custos e títulos.
      vehicle: {
        include: {
          attachments: {
            select: {
              id: true,
              kind: true,
              description: true,
              filename: true,
              mimeType: true,
              size: true,
              latitude: true,
              longitude: true,
              geoAccuracy: true,
              address: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          costs: { select: { description: true, createdAt: true } },
          payables: { select: { description: true, createdAt: true } },
        },
      },
      customer: true,
      financerAccount: true,
    },
  });
  if (!sale || sale.saleType !== "FINANCIAMENTO_TERCEIROS") notFound();
  const [boletos, crlvs, houseKeys] = await Promise.all([
    listPayoffBoletos(sale.vehicleId),
    listIntermediationCrlvs(sale.vehicleId),
    houseNameKeys(),
  ]);
  const doc = situacaoDocumental(
    {
      ...sale.vehicle,
      sale: {
        saleDate: sale.saleDate,
        transferDoneAt: sale.transferDoneAt,
        transferCharged: sale.transferCharged,
        transferAmount: sale.transferAmount,
        ownerName: sale.ownerName,
        ownerDocument: sale.ownerDocument,
        customer: sale.customer,
      },
    },
    houseKeys,
  );
  // Anexar/ler documento do veículo é a mesma permissão da ficha do estoque —
  // é lá que as ações checam.
  const canDocumentos = await userCan("estoque", "comunicacao");
  const ultimoCrlv = sale.vehicle.attachments.find((a) => a.kind === "CRLV") ?? null;

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

      {/* Documentação: a operação financeira acaba no dia, mas o carro só fica
          resolvido quando sai do nome do dono anterior. São as mesmas
          perguntas (e os mesmos selos) do veículo vendido do estoque. */}
      <Card className="mt-4">
        <CardHeader
          title="Documentação e transferência"
          description="Em nome de quem o veículo está e o que ainda falta para o processo terminar"
        />
        <div className="p-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={seloCrlv(doc).tone}>{seloCrlv(doc).label}</Badge>
            {doc.hasAtpv ? <Badge tone="success">✓ ATPV-e</Badge> : null}
            {doc.hasTransferQuote ? (
              <Badge tone="success">✓ Orçamento transf.</Badge>
            ) : sale.transferCharged && sale.transferAmount > 0 ? (
              <Badge tone="warning">⚠ Orçamento transf. pendente</Badge>
            ) : null}
            <Badge tone={doc.hasComunicacao ? "success" : "warning"}>
              {doc.hasComunicacao ? "✓ Comunicação de venda" : "⚠ Comunicação de venda pendente"}
            </Badge>
            <Badge tone={doc.hasFotoCliente ? "success" : "warning"}>
              {doc.hasFotoCliente ? "✓ Foto do cliente" : "⚠ Foto do cliente pendente"}
            </Badge>
            {/* Refinanciamento não transfere nada: o veículo continua com o
                proprietário, que é o próprio financiado. */}
            {sale.refinancing ? null : (
              <Badge tone={doc.transferDoneAt ? "success" : "danger"}>
                {doc.transferDoneAt
                  ? doc.transferDoneByCrlv
                    ? "✓ Transferido · CRLV no nome do comprador"
                    : `✓ Transferido em ${formatDate(doc.transferDoneAt)}`
                  : "⚠ No nome do dono anterior"}
              </Badge>
            )}
          </div>
          {sale.vehicle.docOwnerName ? (
            <p className="mt-3 text-sm text-slate-600">
              Este veículo está em nome de{" "}
              <strong className={doc.docOwnerOk ? "text-emerald-600" : "text-rose-600"}>
                {sale.vehicle.docOwnerName}
              </strong>
            </p>
          ) : null}
          {sale.vehicle.transferToName && !doc.transferDoneAt ? (
            <p className="mt-0.5 text-sm text-sky-700">
              🔄 Transferência para <strong>{sale.vehicle.transferToName}</strong> (cliente do
              orçamento do despachante)
            </p>
          ) : null}
        </div>

        {sale.refinancing ? null : (
          <div className="px-5 pb-1">
            <SaleTransferSetting
              saleId={sale.id}
              initialDone={sale.transferDoneAt ? sale.transferDoneAt.toISOString().slice(0, 10) : ""}
              canManage={canDocumentos}
              crlvOwner={doc.transferDoneByCrlv ? sale.vehicle.docOwnerName : null}
              crlvDate={
                doc.transferDoneByCrlv && ultimoCrlv
                  ? ultimoCrlv.createdAt.toISOString().slice(0, 10)
                  : null
              }
            />
          </div>
        )}

        <div className="mx-5 mb-4 rounded-lg border border-slate-200">
          <p className="border-b border-slate-100 px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Processo de transferência (DETRAN)
          </p>
          <TransferInProgressSetting
            vehicleId={sale.vehicle.id}
            initial={sale.vehicle.transferInProgress}
            canManage={canDocumentos}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Orçamento de transferência (despachante)"
          description="Anexe o orçamento/recibo do despachante: a IA lê e acerta o título da transferência no Contas a pagar"
        />
        <VehicleTransferQuote
          vehicleId={sale.vehicle.id}
          canManage={canDocumentos}
          transferToName={sale.vehicle.transferToName}
          quotes={sale.vehicle.attachments.filter(
            (a) => a.kind === "DOCUMENTO" && ORCAMENTO_TRANSFERENCIA_RE.test(a.description),
          )}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="ATPV-e"
          description="Anexe a Autorização para Transferência de Propriedade do Veículo (ATPV-e) assinada pelo proprietário"
        />
        <VehicleAtpv
          vehicleId={sale.vehicle.id}
          canManage={canDocumentos}
          atpvs={sale.vehicle.attachments.filter(
            (a) => a.kind === "DOCUMENTO" && /atpv/i.test(a.description),
          )}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Documentos do veículo"
          description="Anexe a Comunicação de venda (Detran) e outros documentos desta operação"
        />
        <VehicleAttachments
          vehicleId={sale.vehicle.id}
          canManage={canDocumentos}
          attachments={sale.vehicle.attachments.filter(
            (a) =>
              a.kind !== "FOTO_VEICULO" &&
              a.kind !== "CRLV" &&
              // ATPV-e, orçamento, boleto de quitação e nota do 0 km já têm
              // lugar próprio nesta tela — não se repetem aqui.
              !(a.kind === "DOCUMENTO" && /atpv/i.test(a.description)) &&
              !(a.kind === "DOCUMENTO" && ORCAMENTO_TRANSFERENCIA_RE.test(a.description)) &&
              !a.description.startsWith(PAYOFF_BOLETO_PREFIX) &&
              !a.description.startsWith(NOTA_VEICULO_PREFIX),
          )}
        />
      </Card>

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
