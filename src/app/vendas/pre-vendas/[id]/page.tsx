import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import { computeReturn, retornoLabel } from "@/lib/retorno";
import CompanyDocHeader from "@/components/CompanyDocHeader";
import PreSaleActions from "./PreSaleActions";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;

function money(n: number) {
  return formatCurrency(n);
}

/** Linha de valor no resumo (rótulo à esquerda, valor à direita). */
function Row({
  label,
  value,
  strong,
  tone,
  top,
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: "green" | "rose";
  top?: boolean;
}) {
  const color = tone === "green" ? "text-emerald-700" : tone === "rose" ? "text-rose-600" : "text-slate-700";
  return (
    <div
      className={`flex items-center justify-between gap-3 ${top ? "mt-1 border-t border-slate-200 pt-1" : ""} ${
        strong ? "font-semibold" : ""
      } ${color}`}
    >
      <span>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{money(value)}</span>
    </div>
  );
}

export default async function PreVendaFichaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const { erro } = await searchParams;
  const pre = await prisma.preSale.findUnique({ where: { id } });
  if (!pre) notFound();

  const [company, vehicle, customer, financer, advanceRow] = await Promise.all([
    getCompany(),
    prisma.vehicle.findUnique({ where: { id: pre.vehicleId } }),
    prisma.customer.findUnique({ where: { id: pre.customerId } }),
    pre.financerAccountId
      ? prisma.financialAccount.findUnique({ where: { id: pre.financerAccountId }, select: { name: true, returnTaxPercent: true } })
      : Promise.resolve(null),
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { vehicleId: pre.vehicleId, saleId: null, status: "RECEBIDO" },
    }),
  ]);

  const total = pre.totalAmount;
  const tiLiquido = pre.tradeIn
    ? Math.max(0, Math.round(((pre.tiNegotiated ?? 0) - (pre.tiPayoff ?? 0) - (pre.tiDebts ?? 0)) * 100) / 100)
    : 0;
  const sinal = advanceRow._sum.amount ?? 0;
  const rawRestante = Math.round((total - tiLiquido - sinal) * 100) / 100;
  const restanteFin = Math.max(0, rawRestante);
  const baseDevolucao = Math.max(0, Math.round(-rawRestante * 100) / 100);
  const financedTyped = pre.paymentMethod === "FINANCIADO" ? pre.financedAmount ?? 0 : 0;
  const financedParaCarro = Math.min(financedTyped, restanteFin);
  const entradaFin = Math.max(0, Math.round((restanteFin - financedParaCarro) * 100) / 100);
  const devolucao =
    pre.paymentMethod === "FINANCIADO"
      ? Math.round((baseDevolucao + Math.max(0, financedTyped - restanteFin)) * 100) / 100
      : baseDevolucao;
  const aReceberFin = pre.financerAccountId
    ? entradaFin
    : Math.round((entradaFin + financedTyped) * 100) / 100;
  const methodLabel =
    pre.paymentMethod === "A_VISTA" ? "à vista" : pre.paymentMethod === "PARCELADO" ? "parcelado" : "financiado";
  const retorno =
    pre.paymentMethod === "FINANCIADO" && pre.returnLevel > 0
      ? computeReturn(financedTyped > 0 ? financedTyped : restanteFin, pre.returnLevel, financer?.returnTaxPercent ?? 0)
      : null;

  const editHref = `/vendas/novo?preSale=${pre.id}`;
  const converted = pre.status === "CONVERTIDA";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <PreSaleActions id={pre.id} editHref={editHref} />
      </div>

      {erro ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 print:hidden">
          <strong>Não foi possível registrar a venda:</strong> {erro} A pré-venda continua aberta e
          nada foi lançado — ajuste e tente novamente.
        </div>
      ) : null}

      {converted ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">
          ✓ Esta pré-venda já foi convertida em venda.{" "}
          {pre.convertedSaleId ? (
            <Link href={`/vendas/${pre.convertedSaleId}`} className="font-semibold underline">
              Ver a venda
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          Isto é uma <strong>pré-venda</strong> (ficha de negócio). Nada foi lançado no financeiro ainda —
          revise e clique em <strong>Registrar venda</strong> quando quiser efetivar.
        </div>
      )}

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">FICHA DE NEGÓCIO</p>
              <p className="text-slate-500">Pré-venda Nº {String(pre.number).padStart(4, "0")}</p>
              <p className="text-slate-500">Emissão: {formatDate(pre.saleDate)}</p>
            </>
          }
        />

        <p className="mb-5 text-xs text-slate-500">
          Documento interno de resumo da negociação. Não é o contrato de compra e venda.
        </p>

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Negociação
          </h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">Veículo:</span> <strong>{vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.plate}` : "—"}</strong></p>
            <p><span className="text-slate-500">Cliente:</span> <strong>{customer?.name ?? "—"}</strong></p>
            <p><span className="text-slate-500">Vendedor:</span> {pre.sellerName || "—"}</p>
            <p><span className="text-slate-500">Data:</span> {formatDate(pre.saleDate)}</p>
            <p><span className="text-slate-500">Forma de pagamento:</span> {paymentLabel[pre.paymentMethod]}</p>
            {sinal > 0 ? <p><span className="text-slate-500">Sinal já recebido:</span> {money(sinal)}</p> : null}
          </div>
        </section>

        {pre.tradeIn ? (
          <section className="mb-5">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Veículo recebido em troca
            </h2>
            <p className="mb-2 text-sm">
              <strong>{[pre.tiBrand, pre.tiModel, pre.tiPlate].filter(Boolean).join(" ") || "—"}</strong>
              {pre.tiPayoffTo ? <span className="text-slate-500"> · quitação: {pre.tiPayoffTo}</span> : null}
            </p>
            <div className="space-y-1 text-sm">
              <Row label="Avaliação" value={pre.tiNegotiated ?? 0} />
              <Row label="(−) Quitação / saldo devedor" value={pre.tiPayoff ?? 0} />
              <Row label="(−) Débitos (IPVA, multas)" value={pre.tiDebts ?? 0} />
              <Row label="= Entrada da troca" value={tiLiquido} strong tone="green" top />
            </div>
          </section>
        ) : null}

        {pre.paymentMethod === "PARCELADO" ? (
          <section className="mb-5 text-sm">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Parcelamento
            </h2>
            <Row label="Entrada" value={pre.downPayment} />
            <div className="flex items-center justify-between gap-3 text-slate-700">
              <span>Número de parcelas</span>
              <span className="tabular-nums">{pre.installmentsCount}x</span>
            </div>
          </section>
        ) : null}

        {pre.paymentMethod === "FINANCIADO" ? (
          <section className="mb-5 text-sm">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Financiamento
            </h2>
            <p className="mb-1"><span className="text-slate-500">Financeira:</span> {financer?.name || "Não informada"}</p>
            <Row label="Valor financiado (banco)" value={financedTyped} />
            {retorno && retorno.net > 0 ? (
              <>
                <Row label={`Retorno ${retornoLabel(pre.returnLevel)} (bruto)`} value={retorno.gross} />
                <Row label="(−) Imposto retido" value={retorno.tax} tone="rose" />
                <Row label="= Retorno líquido (recebe da financeira)" value={retorno.net} strong tone="green" />
              </>
            ) : null}
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Fechamento
          </h2>
          <div className="space-y-1 text-sm">
            <Row label="Valor da venda" value={total} />
            {tiLiquido > 0 ? <Row label="(−) Entrada da troca" value={tiLiquido} /> : null}
            {sinal > 0 ? <Row label="(−) Sinal já recebido" value={sinal} /> : null}
            {pre.paymentMethod === "FINANCIADO" && financedTyped > 0 ? (
              <Row label="(−) Financiado pelo banco" value={financedTyped} />
            ) : null}
            {devolucao > 0 ? (
              <Row label="= Devolução ao cliente (Contas a Pagar)" value={devolucao} strong tone="rose" top />
            ) : pre.paymentMethod === "FINANCIADO" ? (
              <Row label="= Entrada do cliente (Contas a Receber)" value={aReceberFin} strong tone="green" top />
            ) : (
              <Row label={`= Restante a pagar (${methodLabel})`} value={restanteFin} strong top />
            )}
          </div>
        </section>

        {pre.notes ? (
          <section className="mt-5 text-sm">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Observações
            </h2>
            <p className="whitespace-pre-wrap text-slate-700">{pre.notes}</p>
          </section>
        ) : null}

        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Cliente</div>
          <div className="border-t border-slate-400 pt-1">Loja / Vendedor</div>
        </div>
      </div>
    </div>
  );
}
