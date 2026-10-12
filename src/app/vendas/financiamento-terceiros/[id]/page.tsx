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
  listDebitosGuias,
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
import VehicleCrlv from "@/app/estoque/[id]/VehicleCrlv";
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
      seller: { select: { name: true } },
      // Títulos que a operação gerou (repasse, devolução, comissões, indicações,
      // transferência): para ver, ao revisitar, o que já foi pago/recebido.
      payables: {
        select: { id: true, description: true, amount: true, status: true, dueDate: true, paymentDate: true },
        orderBy: { dueDate: "asc" },
      },
      receivables: {
        select: { id: true, description: true, amount: true, status: true, dueDate: true, receivedDate: true },
        orderBy: { dueDate: "asc" },
      },
    },
  });
  if (!sale || sale.saleType !== "FINANCIAMENTO_TERCEIROS") notFound();
  const [boletos, guiasDebitos, crlvs, houseKeys] = await Promise.all([
    listPayoffBoletos(sale.vehicleId),
    listDebitosGuias(sale.vehicleId),
    listIntermediationCrlvs(sale.vehicleId),
    houseNameKeys(),
  ]);
  // CRLV que está em outra ficha do mesmo carro (vide listIntermediationCrlvs)
  // também conta para o selo.
  const anexosDoc = [
    ...sale.vehicle.attachments,
    ...crlvs
      .filter((c) => !sale.vehicle.attachments.some((a) => a.id === c.id) && !c.description.startsWith(NOTA_VEICULO_PREFIX))
      .map((c) => ({ ...c, kind: "CRLV" as const, mimeType: "", latitude: null, longitude: null, geoAccuracy: null, address: null })),
  ];
  const doc = situacaoDocumental(
    {
      ...sale.vehicle,
      attachments: anexosDoc,
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
  // Cada card de documento com a sua permissão granular (como na ficha do veículo).
  const [canDocumentos, canAtpv, canOrcamento, canTransferencia, canEditarEstoque, canCrlv] = await Promise.all([
    userCan("estoque", "comunicacao"),
    userCan("estoque", "atpv"),
    userCan("estoque", "orcamento"),
    userCan("estoque", "transferencia"),
    userCan("estoque", "editar"),
    userCan("estoque", "crlv"),
  ]);
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
          {sale.devolucaoPara === "TERCEIRO" ? (
            <p className="sm:col-span-2">
              <span className="text-slate-500">Devolução a terceiro (autorizado pelas partes):</span>{" "}
              <strong>{sale.devolucaoTerceiroNome || "—"}</strong> · CPF/CNPJ {sale.devolucaoTerceiroDocumento || "—"}
              {sale.devolucaoTerceiroVinculo ? ` · ${sale.devolucaoTerceiroVinculo}` : ""}
            </p>
          ) : null}
          <CrlvLine crlvs={crlvs} />
        </div>
      </Card>

      {/* Tudo o que foi registrado na operação — para quem revisita a venda
          depois (quem vendeu, contatos, retorno, indicações, observações). */}
      <Card className="mb-4">
        <CardHeader title="Dados da venda" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 p-5 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Operação nº:</span> {String(sale.orderNumber).padStart(4, "0")}</p>
          <p>
            <span className="text-slate-500">Situação:</span>{" "}
            <Badge tone={canceled ? "danger" : "success"}>{canceled ? "Cancelada" : "Concluída"}</Badge>
          </p>
          <p>
            <span className="text-slate-500">Vendedor:</span>{" "}
            <strong>{sale.seller?.name || sale.sellerName || "—"}</strong>
            {sale.commissionAmount > 0
              ? ` · comissão ${formatCurrency(sale.commissionAmount)}${sale.commissionToCapital ? " (aplicada no capital)" : ""}`
              : ""}
          </p>
          {sale.viaPaidTraffic ? (
            <p><span className="text-slate-500">Origem:</span> Tráfego pago</p>
          ) : null}
          <p>
            <span className="text-slate-500">Comprador:</span> {sale.customer.name}
            {sale.customer.document ? ` · CPF/CNPJ ${sale.customer.document}` : ""}
          </p>
          <p>
            <span className="text-slate-500">Contato do comprador:</span>{" "}
            {[sale.customer.phone, sale.customer.email].filter(Boolean).join(" · ") || "—"}
          </p>
          <p>
            <span className="text-slate-500">Contato do proprietário:</span> {sale.ownerPhone || "—"}
          </p>
          <p><span className="text-slate-500">Endereço do proprietário:</span> {sale.ownerAddress || "—"}</p>
          {sale.installmentsInfoCount && sale.installmentsInfoAmount ? (
            <p>
              <span className="text-slate-500">Parcelas do financiamento:</span> {sale.installmentsInfoCount}×{" "}
              {formatCurrency(sale.installmentsInfoAmount)}
            </p>
          ) : null}
          {sale.buyerBankName || sale.buyerPixKey ? (
            <p className="sm:col-span-2">
              <span className="text-slate-500">Dados bancários para a devolução:</span>{" "}
              {[
                sale.buyerBankName,
                sale.buyerBankAgency && `ag. ${sale.buyerBankAgency}`,
                sale.buyerBankAccount && `conta ${sale.buyerBankAccount}`,
                sale.buyerBankAccountType,
                sale.buyerPixKey && `PIX ${sale.buyerPixKey}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <p>
            <span className="text-slate-500">Repasse da financeira:</span>{" "}
            {sale.financerSettledAt ? `recebido em ${formatDate(sale.financerSettledAt)}` : "a receber"}
          </p>
          {sale.returnLevel > 0 || sale.returnNet > 0 ? (
            <p>
              <span className="text-slate-500">Retorno:</span>{" "}
              {sale.returnLevel > 0 ? `R-${String(sale.returnLevel).padStart(2, "0")} · ` : ""}
              {sale.returnSettledAt
                ? `recebido em ${formatDate(sale.returnSettledAt)}${
                    sale.returnPaidAmount != null ? ` (${formatCurrency(sale.returnPaidAmount)})` : ""
                  }`
                : "a receber"}
            </p>
          ) : null}
          {sale.insuranceSold ? (
            <p>
              <span className="text-slate-500">Seguro:</span>{" "}
              {formatCurrency(sale.insuranceAmount ?? 0)}
              {sale.insuranceCommissionAmount > 0 ? ` · comissão ${formatCurrency(sale.insuranceCommissionAmount)}` : ""}
              {sale.insuranceSettledAt ? ` · recebida em ${formatDate(sale.insuranceSettledAt)}` : " · a receber"}
            </p>
          ) : null}
          <p>
            <span className="text-slate-500">Veículo:</span>{" "}
            {[
              sale.vehicle.modelYear ? `${sale.vehicle.manufactureYear}/${sale.vehicle.modelYear}` : null,
              sale.vehicle.color,
              sale.vehicle.km ? `${sale.vehicle.km.toLocaleString("pt-BR")} km` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <p>
            <span className="text-slate-500">Chassi / RENAVAM:</span> {sale.vehicle.chassi || "—"} /{" "}
            {sale.vehicle.renavam || "—"}
          </p>
          {referrals.length > 0 ? (
            <div className="sm:col-span-2">
              <span className="text-slate-500">Indicações:</span>{" "}
              {referrals.map((r) => `${r.name} (${formatCurrency(r.amount)})`).join(" · ")}
            </div>
          ) : null}
          {sale.notes ? (
            <p className="sm:col-span-2 whitespace-pre-line">
              <span className="text-slate-500">Observações:</span> {sale.notes}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Financiamento" />
        <div className="p-5">
          <Row label="Valor do financiamento (F)" value={formatCurrency(sale.financingAmount)} />
          <Row
            label={
              sale.refinancing
                ? "(−) Devolução ao financiado (D)"
                : sale.devolucaoPara === "PROPRIETARIO"
                  ? "(−) Devolução ao proprietário/vendedor (D)"
                  : sale.devolucaoPara === "TERCEIRO"
                    ? "(−) Devolução a terceiro autorizado (D)"
                    : "(−) Devolução ao cliente (D)"
            }
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

      {sale.payables.length > 0 || sale.receivables.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Títulos da operação"
            description="O que a operação gerou no Contas a pagar e a receber, e o que já foi baixado"
          />
          <div className="divide-y divide-slate-100 px-5 py-2 text-sm">
            {sale.receivables.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-slate-700">📥 {r.description}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-emerald-700">+{formatCurrency(r.amount)}</span>
                  <Badge tone={r.status === "RECEBIDO" ? "success" : "warning"}>
                    {r.status === "RECEBIDO" && r.receivedDate ? `recebido ${formatDate(r.receivedDate)}` : "a receber"}
                  </Badge>
                </span>
              </div>
            ))}
            {sale.payables.map((pg) => (
              <div key={pg.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <a href={`/financeiro/a-pagar/${pg.id}/ordem`} className="min-w-0 text-slate-700 hover:text-blue-700 hover:underline">
                  📤 {pg.description}
                </a>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-rose-600">−{formatCurrency(pg.amount)}</span>
                  <Badge tone={pg.status === "PAGO" ? "success" : "warning"}>
                    {pg.status === "PAGO" && pg.paymentDate ? `pago ${formatDate(pg.paymentDate)}` : `vence ${formatDate(pg.dueDate)}`}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <PayoffCard
        className="mt-4"
        payoff={{ bank: sale.payoffBank, amount: sale.payoffAmount, barcode: sale.payoffBarcode, dueDate: sale.payoffDueDate }}
        boletos={boletos}
      />

      {/* Débitos do veículo (IPVA, multas, licenciamento): mesma mecânica da
          quitação do financiamento, com a guia do órgão no lugar do boleto. */}
      <PayoffCard
        className="mt-4"
        titulo="Quitação de débitos do veículo"
        descricao="IPVA, multas e licenciamento anteriores pagos com parte do valor financiado — consta no contrato de intermediação."
        rotuloCredor="Órgão / emissor"
        rotuloDocumento="guia"
        detalhe={{ rotulo: "O que está sendo quitado", valor: sale.debtsDescricao }}
        payoff={{ bank: sale.debtsOrgao, amount: sale.debtsAmount, barcode: sale.debtsBarcode, dueDate: sale.debtsDueDate }}
        boletos={guiasDebitos}
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
              canManage={canTransferencia || canEditarEstoque}
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
            canManage={canTransferencia || canEditarEstoque}
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
          canManage={canOrcamento}
          transferToName={sale.vehicle.transferToName}
          quotes={sale.vehicle.attachments.filter(
            (a) => a.kind === "DOCUMENTO" && ORCAMENTO_TRANSFERENCIA_RE.test(a.description),
          )}
        />
      </Card>

      {/* CRLV do veículo: anexar/ler aqui mesmo (o da pré-venda aparece em
          "Partes"); mesma permissão "Anexar CRLV" da ficha do estoque. */}
      <Card className="mt-4">
        <CardHeader
          title="CRLV"
          description="Anexe o CRLV do veículo (o lido na pré-venda já aparece aqui)"
        />
        <VehicleCrlv
          vehicleId={sale.vehicleId}
          canManage={canCrlv}
          crlvs={crlvs.filter((c) => !c.description.startsWith(NOTA_VEICULO_PREFIX))}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="ATPV-e"
          description="Anexe a Autorização para Transferência de Propriedade do Veículo (ATPV-e) assinada pelo proprietário"
        />
        <VehicleAtpv
          vehicleId={sale.vehicle.id}
          canManage={canAtpv}
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
