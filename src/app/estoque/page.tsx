import Link from "next/link";
import { timed } from "@/lib/perf";
import { pendenciasRenave } from "@/lib/renave";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { daysBetween } from "@/lib/reports";
import { Badge, Card, EmptyState, LinkButton, Select, Table, Td, Th, Thead, Tr, PageHeader } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";
import PrintButton from "@/components/PrintButton";
import PendingCostLink from "./PendingCostLink";
import { userCan } from "@/lib/guards";
import { nameKey } from "@/lib/person-keys";
import type { StatusVeiculo } from "@prisma/client";

export const dynamic = "force-dynamic";

const statusLabel: Record<StatusVeiculo, { label: string; tone: "info" | "warning" | "success" }> = {
  ESTOQUE: { label: "Em estoque", tone: "info" },
  RESERVADO: { label: "Reservado", tone: "warning" },
  VENDIDO: { label: "Vendido", tone: "success" },
};

function agingTone(days: number): "success" | "info" | "warning" | "danger" {
  if (days <= 30) return "success";
  if (days <= 60) return "info";
  if (days <= 90) return "warning";
  return "danger";
}

/**
 * Nome do veículo para a ficha de venda. A versão só entra quando acrescenta
 * algo: muitos cadastros repetem a versão dentro do modelo ("Onix Joy Black" +
 * versão "BLACK"), e no PDF isso saía duplicado.
 */
function vehicleLabel(brand: string, model: string, version: string | null): string {
  const base = `${brand} ${model}`.trim();
  const v = (version || "").trim();
  if (!v || nameKey(base).includes(nameKey(v))) return base;
  return `${base} ${v}`;
}

/**
 * O veículo está no nome da CASA (a loja ou um dos sócios) ou de terceiro?
 *
 * A comparação é por `nameKey` (sem acento/pontuação/espaço) e por CONTINÊNCIA
 * nos dois sentidos, porque o CRLV traz a razão social completa enquanto o
 * cadastro costuma ter a forma curta: "MVP VEICULOS LTDA" (documento) casa com
 * "MVP Veículos" (Parâmetros). Terceiro — "FABIANO FROES NEGOCIOS LTDA" — não
 * casa com nenhuma das nossas.
 *
 * Sem nome conhecido no CRLV o selo nem aparece (ver a listagem).
 */
function isOwnName(ownerName: string, houseKeys: string[]): boolean {
  const key = nameKey(ownerName);
  if (!key) return false;
  return houseKeys.some((h) => h.length >= 4 && (key.includes(h) || h.includes(key)));
}

/**
 * Selo de documentação do veículo, em três estados:
 *  - "⚠ CRLV pendente": sem CRLV anexado e sem transferência lançada;
 *  - "🔄 Transferência em aberto": custo de transferência (DETRAN) lançado e o
 *    CRLV novo ainda não anexado — o processo está correndo;
 *  - "✓ CRLV {ano}" (ou "✓ Transferido · CRLV {ano}"): o CRLV no nome da
 *    loja/sócio foi anexado — documentação em dia.
 */
function crlvBadge(
  hasCrlv: boolean,
  year: string | null,
  transferStarted: boolean,
  docOwnerIsOurs: boolean,
  transferManual: boolean,
  saleTransferPending: boolean,
): { label: string; tone: "success" | "warning" | "info" } {
  const crlv = `CRLV${year ? ` ${year}` : ""}`;
  // Marca MANUAL "em processo de transferência" vence tudo: o usuário afirmou
  // que a transferência ainda está correndo (ex.: veículo vendido cujo CRLV
  // ainda está no nome de um sócio, não do comprador). Desfazer a marca na ficha
  // libera os demais estados.
  if (transferManual) return { label: "🔄 Processo de transferência em aberto", tone: "info" };
  // Veículo vendido/pré-vendido, ainda no nosso nome, com transferência lançada:
  // é a transferência ao COMPRADOR em andamento — vence o "Transferido".
  if (saleTransferPending) return { label: "🔄 Processo de transferência em aberto", tone: "info" };
  // Documento JÁ no nome da loja/sócio → transferência concluída de fato. Ter
  // CRLV anexado não basta: pode ser o do dono anterior (ex.: implantação de
  // estoque com o CRLV antigo).
  if (hasCrlv && docOwnerIsOurs) return { label: `✓ Transferido · ${crlv}`, tone: "success" };
  // Processo em aberto (custo de transferência) e ainda NÃO no nosso nome —
  // mesmo com o CRLV do dono anterior anexado.
  if (transferStarted) return { label: "🔄 Processo de transferência em aberto", tone: "info" };
  // Tem CRLV, sem processo e sem confirmação de que está no nosso nome.
  if (hasCrlv) return { label: `✓ ${crlv}`, tone: "success" };
  return { label: "⚠ CRLV pendente", tone: "warning" };
}

/**
 * Selo de publicação na vitrine pública. "Na vitrine" só quando o anúncio
 * REALMENTE aparece (publicado + em estoque + sem pré-venda aberta) — é o mesmo
 * critério do QR do para-brisa. Publicado mas oculto (reservado/pré-venda) e não
 * publicado têm avisos próprios.
 */
function vitrineBadge(
  published: boolean,
  status: string,
  hasPreSale: boolean,
): { label: string; tone: "success" | "warning" | "info" } {
  if (published && status === "ESTOQUE" && !hasPreSale) return { label: "✓ Na vitrine", tone: "success" };
  if (published) return { label: "🔒 Publicado (oculto na vitrine)", tone: "info" };
  return { label: "⚠ Fora da vitrine", tone: "warning" };
}

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; doc?: string; q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const params = await searchParams;
  const { de, ate, min, max } = params;
  // Filtro por situação de documentação (selo do card): transferência em aberto,
  // orçamento, transferido, CRLV pendente, ATPV-e.
  const docFilter = params.doc && params.doc !== "TODOS" ? params.doc : null;
  // "PRE_VENDIDO" é um filtro derivado (veículo em estoque com pré-venda em
  // aberto), não um status do banco. Os demais valores são status reais.
  const preVendidoFilter = params.status === "PRE_VENDIDO";
  const status =
    params.status && params.status !== "TODOS" && params.status !== "PRE_VENDIDO"
      ? (params.status as StatusVeiculo)
      : undefined;
  const q = params.q?.trim();
  const now = new Date();
  // Duas permissões separadas: uma para VER o custo aqui na lista e outra para
  // LEVAR esse custo para fora no PDF. Quem não tem a primeira também não vê
  // custo no PDF, porque ele é montado a partir desta mesma tabela.
  const [canVerCusto, canPdfCusto, canVerAPagar] = await Promise.all([
    userCan("estoque", "vercusto"),
    userCan("estoque", "pdfcusto"),
    userCan("financeiro", "visualizar"),
  ]);

  const [vehicles, openPreSales, company, beneficiaryNames] = await timed("tela: estoque", () =>
    Promise.all([
      prisma.vehicle.findMany({
        where: { status, intermediation: false },
        include: {
          // Descrição junto: detecta o custo de transferência (DETRAN) para o
          // selo "Processo de transferência em aberto".
          // createdAt junto: um CRLV no nosso nome anexado DEPOIS do lançamento
          // da transferência marca o processo como concluído.
          costs: { select: { amount: true, description: true, capitalBeneficiaryId: true, createdAt: true } },
          // description junto: uma conta a pagar com "transferência" (pagamento
          // ao despachante) também acende o selo "em processo de transferência".
          payables: { select: { amount: true, status: true, description: true, createdAt: true } },
          // Só precisa saber SE há comunicação de venda e foto do cliente anexadas.
          attachments: { select: { kind: true, description: true, createdAt: true } },
          // Se este veículo foi RECEBIDO EM TROCA, ele é o tradeInVehicle de uma
          // venda — a relação inversa traz o nº da venda e o carro que saiu nela.
          tradeInForSale: {
            select: {
              orderNumber: true,
              vehicle: { select: { brand: true, model: true, plate: true } },
            },
          },
          // Data da venda: ordena o bloco dos vendidos (mais recente primeiro).
          // transferDoneAt: nulo = o carro ainda está no nome do dono anterior.
          sale: { select: { saleDate: true, transferDoneAt: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Pré-vendas em aberto: o veículo continua no estoque, mas já está pré-vendido.
      prisma.preSale.findMany({
        where: { status: "ABERTA" },
        select: { vehicleId: true, number: true },
        orderBy: { number: "desc" },
      }),
      // Nomes "da casa" (loja + sócios): decidem se o proprietário do CRLV sai
      // em verde (nosso) ou vermelho (terceiro).
      prisma.companySettings.findUnique({
        where: { id: "company" },
        select: { razaoSocial: true, nomeFantasia: true },
      }),
      prisma.capitalBeneficiary.findMany({ select: { name: true } }),
    ]),
  );

  const houseKeys = [
    company?.razaoSocial,
    company?.nomeFantasia,
    ...beneficiaryNames.map((b) => b.name),
  ]
    .map((n) => nameKey(n))
    .filter((k) => k.length >= 4);

  // vehicleId → número da pré-venda aberta mais recente (ordenado desc: 1º = maior).
  const preSaleByVehicle = new Map<string, number>();
  for (const ps of openPreSales) {
    if (!preSaleByVehicle.has(ps.vehicleId)) preSaleByVehicle.set(ps.vehicleId, ps.number);
  }

  const allRows = vehicles.map((v) => {
    // Momento do ÚLTIMO lançamento de transferência (custo/conta com a palavra)
    // e do ÚLTIMO CRLV anexado. Um CRLV no NOSSO nome anexado DEPOIS do
    // lançamento significa que a transferência paga era a mudança para o nosso
    // nome e ela CONCLUIU — o selo "em processo" deve dar lugar ao
    // "Transferido" (o caso contrário — CRLV antigo, transferência ao comprador
    // em andamento — mantém o "em processo").
    const transferSignals = [
      ...v.costs.filter((c) => /transfer[eê]ncia/i.test(c.description)),
      ...v.payables.filter((p) => /transfer[eê]ncia/i.test(p.description)),
    ].map((x) => x.createdAt.getTime());
    const lastTransferAt = transferSignals.length ? Math.max(...transferSignals) : null;
    const crlvTimes = v.attachments
      .filter((a) => a.kind === "CRLV")
      .map((a) => a.createdAt.getTime());
    const lastCrlvAt = crlvTimes.length ? Math.max(...crlvTimes) : null;
    const docOwnerIsOurs = v.docOwnerName ? isOwnName(v.docOwnerName, houseKeys) : false;
    const transferConcluded =
      docOwnerIsOurs && lastCrlvAt != null && lastTransferAt != null && lastCrlvAt > lastTransferAt;

    return {
    ...v,
    preSaleNumber: preSaleByVehicle.get(v.id) ?? null,
    hasComunicacao: v.attachments.some((a) => /comunica/i.test(a.description)),
    hasFotoCliente: v.attachments.some((a) => a.kind === "FOTO_CLIENTE"),
    hasCrlv: v.attachments.some((a) => a.kind === "CRLV"),
    // Documento no nome da loja/sócio (verde) ou de terceiro (vermelho).
    docOwnerIsOurs,
    // ATPV-e anexada (card próprio na ficha). Só gera selo POSITIVO — sem
    // ATPV-e não aparece nada (nem "pendente").
    hasAtpv: v.attachments.some((a) => a.kind === "DOCUMENTO" && /atpv/i.test(a.description)),
    // Renave: quantos dados ainda faltam para escriturar este veículo. Só selo
    // — a lista e as ações continuam iguais durante a implantação.
    renavePendentes: pendenciasRenave(v).length,
    // Orçamento da transferência (despachante) anexado — só selo positivo.
    hasTransferQuote: v.attachments.some(
      (a) => a.kind === "DOCUMENTO" && /^or[çc]amento de transfer/i.test(a.description),
    ),
    // Processo de transferência iniciado quando qualquer um: marca manual
    // (casos antigos); custo do veículo com "transferência"; ou conta a pagar
    // com "transferência" (pagamento ao despachante), mesmo fora da ficha de
    // venda.
    transferStarted:
      v.transferInProgress ||
      v.costs.some((c) => /transfer[eê]ncia/i.test(c.description)) ||
      v.payables.some((p) => /transfer[eê]ncia/i.test(p.description)),
    // Transferência no DETRAN concluída (só faz sentido em veículo vendido).
    transferDoneAt: v.sale?.transferDoneAt ?? null,
    // Em veículo VENDIDO/PRÉ-VENDIDO ainda no nosso nome, uma transferência
    // lançada (custo/conta com "transferência") significa a transferência ao
    // COMPRADOR em andamento — então o selo "em processo" deve vencer o
    // "Transferido". Em estoque puro isso não vale (senão todo carro comprado,
    // que teve custo de transferência ao entrar, ficaria eternamente "em
    // processo"). Não vale se a baixa no DETRAN já foi marcada como concluída.
    saleTransferPending:
      (v.status === "VENDIDO" || preSaleByVehicle.has(v.id)) &&
      !v.sale?.transferDoneAt &&
      (v.transferInProgress ||
        // Detecção automática só enquanto o processo NÃO concluiu (CRLV no
        // nosso nome anexado depois do lançamento encerra o aviso); a marca
        // MANUAL continua valendo até ser desfeita na ficha.
        (!transferConcluded &&
          (v.costs.some((c) => /transfer[eê]ncia/i.test(c.description)) ||
            v.payables.some((p) => /transfer[eê]ncia/i.test(p.description))))),
    // Ano em exercício do CRLV mais recente (guardado no description "CRLV 2025").
    crlvYear:
      v.attachments
        .filter((a) => a.kind === "CRLV")
        .map((a) => a.description.match(/(\d{4})/)?.[1] ?? "")
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    // Custos custeados pelo capital de um sócio ficam de fora do "investido" da
    // loja (são do sócio, dono do resultado do carro).
    invested:
      v.purchasePrice +
      v.costs.filter((c) => !c.capitalBeneficiaryId).reduce((sum, c) => sum + c.amount, 0),
    // Custo real = tudo o que já foi efetivamente PAGO por esse veículo
    // (aquisição + manutenção/custos), pela conta financeira.
    paidCost: v.payables.filter((p) => p.status === "PAGO").reduce((s, p) => s + p.amount, 0),
    // O que ainda falta pagar desse veículo (ex.: quitação/débitos da troca).
    pendingCost: v.payables
      .filter((p) => p.status === "PENDENTE" || p.status === "ATRASADO")
      .reduce((s, p) => s + p.amount, 0),
    daysInStock: daysBetween(v.entryDate, now),
    // Veículo recebido em troca (é o carro que entrou numa venda como troca).
    receivedInTrade: v.tradeInForSale != null,
    tradeOrigin: v.tradeInForSale
      ? `Recebido em troca na venda #${String(v.tradeInForSale.orderNumber).padStart(4, "0")}` +
        (v.tradeInForSale.vehicle
          ? ` (${v.tradeInForSale.vehicle.brand} ${v.tradeInForSale.vehicle.model} - ${v.tradeInForSale.vehicle.plate})`
          : "")
      : null,
    };
  });

  // Filtro derivado "Pré-vendido": em estoque (não vendido) e com pré-venda aberta.
  const statusFiltered = preVendidoFilter
    ? allRows.filter((v) => v.status !== "VENDIDO" && v.preSaleNumber != null)
    : allRows;

  // Situação de documentação: usa o MESMO selo do card (crlvBadge) para casar
  // com o que o usuário vê. "Transferido" também inclui a baixa concluída no
  // DETRAN (transferDoneAt) dos vendidos.
  const docMatch = (v: (typeof allRows)[number]): boolean => {
    if (!docFilter) return true;
    const badge = crlvBadge(
      v.hasCrlv,
      v.crlvYear,
      v.transferStarted,
      v.docOwnerIsOurs,
      v.transferInProgress,
      v.saleTransferPending,
    );
    switch (docFilter) {
      case "TRANSFERENCIA":
        return badge.label.startsWith("🔄");
      case "ORCAMENTO":
        return v.hasTransferQuote;
      case "TRANSFERIDO":
        return badge.label.startsWith("✓ Transferido") || v.transferDoneAt != null;
      case "CRLV_PENDENTE":
        return badge.label.startsWith("⚠");
      case "ATPV":
        return v.hasAtpv;
      case "RENAVE_PENDENTE":
        return v.renavePendentes > 0;
      default:
        return true;
    }
  };

  // Busca livre pelos campos exibidos + intervalo de entrada + faixa de preço.
  const rows = statusFiltered.filter(
    (v) =>
      matchesSearch(
        q,
        v.brand,
        v.model,
        v.version,
        v.plate,
        v.color,
        `${v.manufactureYear}/${v.modelYear}`,
        v.manufactureYear,
        v.modelYear,
        v.km,
        v.paidCost,
        formatCurrency(v.paidCost),
        v.invested,
        formatCurrency(v.invested),
        v.salePrice,
        formatCurrency(v.salePrice),
        statusLabel[v.status].label,
        v.daysInStock,
        v.receivedInTrade ? "recebido em troca" : "",
      ) &&
      inDateRange(v.entryDate, de, ate) &&
      inValueRange(v.salePrice, min, max) &&
      docMatch(v),
  );

  // A lista é do ESTOQUE: os vendidos são histórico e vão para o fim da página,
  // depois de uma divisória, com a venda mais recente em cima.
  const emEstoque = rows.filter((v) => v.status !== "VENDIDO");
  const soldAt = (v: (typeof rows)[number]) => (v.sale?.saleDate ?? v.createdAt).getTime();
  const vendidos = rows.filter((v) => v.status === "VENDIDO").sort((a, b) => soldAt(b) - soldAt(a));

  const totalValue = emEstoque.reduce((sum, v) => sum + v.salePrice, 0);
  const totalInvested = emEstoque.reduce((sum, v) => sum + v.invested, 0);
  const totalPaid = emEstoque.reduce((sum, v) => sum + v.paidCost, 0);

  type Row = (typeof rows)[number];

  /** Card do celular (um por veículo). */
  const renderCard = (v: Row) => (
    <Link key={v.id} href={`/estoque/${v.id}`} className="block">
      <Card className="px-4 py-3.5 transition-shadow active:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {v.brand} {v.model}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {v.plate} · {v.manufactureYear}/{v.modelYear} · {v.km.toLocaleString("pt-BR")} km
            </p>
            {v.docOwnerName ? (
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                Este veículo está em nome de{" "}
                <strong className={v.docOwnerIsOurs ? "text-emerald-600" : "text-rose-600"}>
                  {v.docOwnerName}
                </strong>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={statusLabel[v.status].tone}>{statusLabel[v.status].label}</Badge>
            {v.consigned ? <Badge tone="info">🏷️ Consignado</Badge> : null}
            {v.status !== "VENDIDO" && v.preSaleNumber != null ? (
              <Badge tone="warning">🤝 Pré-vendido nº {String(v.preSaleNumber).padStart(4, "0")}</Badge>
            ) : null}
            {v.receivedInTrade ? (
              <span title={v.tradeOrigin ?? undefined}>
                <Badge tone="default">🔄 Recebido em troca</Badge>
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          {canVerCusto ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Custo pago</p>
              <p className="text-sm font-semibold text-slate-700">{formatCurrency(v.paidCost)}</p>
              {v.pendingCost > 0 ? (
                <p className="text-[11px] text-slate-400">
                  total {formatCurrency(v.invested)} ·{" "}
                  {canVerAPagar ? (
                    <PendingCostLink vehicleId={v.id} amountLabel={formatCurrency(v.pendingCost)} />
                  ) : (
                    <span className="text-rose-500">falta {formatCurrency(v.pendingCost)}</span>
                  )}
                </p>
              ) : v.paidCost < v.invested ? (
                <p className="text-[11px] text-slate-400">de {formatCurrency(v.invested)}</p>
              ) : null}
            </div>
          ) : (
            <div />
          )}
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Preço</p>
            <p className="text-base font-bold text-slate-900">{formatCurrency(v.salePrice)}</p>
          </div>
        </div>
        {v.status !== "VENDIDO" ? (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <Badge tone={crlvBadge(v.hasCrlv, v.crlvYear, v.transferStarted, v.docOwnerIsOurs, v.transferInProgress, v.saleTransferPending).tone}>{crlvBadge(v.hasCrlv, v.crlvYear, v.transferStarted, v.docOwnerIsOurs, v.transferInProgress, v.saleTransferPending).label}</Badge>
            {v.hasAtpv ? <Badge tone="success">✓ ATPV-e</Badge> : null}
            {v.renavePendentes > 0 ? (
              <Badge tone="warning">📒 Renave: {v.renavePendentes} dado(s)</Badge>
            ) : null}
            {v.hasTransferQuote ? <Badge tone="success">✓ Orçamento transf.</Badge> : null}
            {(() => {
              const b = vitrineBadge(v.published, v.status, v.preSaleNumber != null);
              return <Badge tone={b.tone}>{b.label}</Badge>;
            })()}
            <Badge tone={agingTone(v.daysInStock)}>{v.daysInStock} dias em estoque</Badge>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <Badge tone={crlvBadge(v.hasCrlv, v.crlvYear, v.transferStarted, v.docOwnerIsOurs, v.transferInProgress, v.saleTransferPending).tone}>{crlvBadge(v.hasCrlv, v.crlvYear, v.transferStarted, v.docOwnerIsOurs, v.transferInProgress, v.saleTransferPending).label}</Badge>
            {v.hasAtpv ? <Badge tone="success">✓ ATPV-e</Badge> : null}
            {v.renavePendentes > 0 ? (
              <Badge tone="warning">📒 Renave: {v.renavePendentes} dado(s)</Badge>
            ) : null}
            {v.hasTransferQuote ? <Badge tone="success">✓ Orçamento transf.</Badge> : null}
            <Badge tone={v.hasComunicacao ? "success" : "warning"}>
              {v.hasComunicacao ? "✓ Comunicação de venda" : "⚠ Comunicação de venda pendente"}
            </Badge>
            <Badge tone={v.hasFotoCliente ? "success" : "warning"}>
              {v.hasFotoCliente ? "✓ Foto do cliente" : "⚠ Foto do cliente pendente"}
            </Badge>
            <Badge tone={v.transferDoneAt ? "success" : "danger"}>
              {v.transferDoneAt
                ? `✓ Transferido em ${formatDate(v.transferDoneAt)}`
                : "⚠ No nome do dono anterior"}
            </Badge>
          </div>
        )}
      </Card>
    </Link>
  );

  /** Linha da tabela do computador (uma por veículo). */
  const renderRow = (v: Row) => (
    <Tr key={v.id}>
      <Td className="font-medium text-slate-900">
        {v.brand} {v.model} {v.version ? <span className="text-slate-400">{v.version}</span> : null}
        {v.docOwnerName ? (
          <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
            Este veículo está em nome de{" "}
            <strong className={v.docOwnerIsOurs ? "text-emerald-600" : "text-rose-600"}>
              {v.docOwnerName}
            </strong>
          </span>
        ) : null}
      </Td>
      <Td>{v.plate}</Td>
      <Td>{v.color || "-"}</Td>
      <Td>
        {v.manufactureYear}/{v.modelYear}
      </Td>
      <Td>{v.km.toLocaleString("pt-BR")} km</Td>
      {canVerCusto ? (
        <Td className="text-right tabular-nums">
          {formatCurrency(v.paidCost)}
          {v.pendingCost > 0 ? (
            <span className="block text-[11px] text-slate-400">
              total {formatCurrency(v.invested)} ·{" "}
              {canVerAPagar ? (
                <PendingCostLink vehicleId={v.id} amountLabel={formatCurrency(v.pendingCost)} />
              ) : (
                <span className="text-rose-500">falta {formatCurrency(v.pendingCost)}</span>
              )}
            </span>
          ) : v.paidCost < v.invested ? (
            <span className="block text-[11px] text-slate-400">de {formatCurrency(v.invested)}</span>
          ) : null}
        </Td>
      ) : null}
      <Td className="text-right tabular-nums">{formatCurrency(v.salePrice)}</Td>
      <Td className="text-right">
        {v.status !== "VENDIDO" ? (
          <Badge tone={agingTone(v.daysInStock)}>{v.daysInStock}</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </Td>
      <Td>
        <Badge tone={statusLabel[v.status].tone}>{statusLabel[v.status].label}</Badge>
        {v.consigned ? (
          <span className="mt-1 block">
            <Badge tone="info">🏷️ Consignado</Badge>
          </span>
        ) : null}
        {v.status !== "VENDIDO" && v.preSaleNumber != null ? (
          <span className="mt-1 block">
            <Badge tone="warning">🤝 Pré-vendido nº {String(v.preSaleNumber).padStart(4, "0")}</Badge>
          </span>
        ) : null}
        {v.receivedInTrade ? (
          <span className="mt-1 block" title={v.tradeOrigin ?? undefined}>
            <Badge tone="default">🔄 Recebido em troca</Badge>
          </span>
        ) : null}
        <span className="mt-1 block">
          <Badge tone={crlvBadge(v.hasCrlv, v.crlvYear, v.transferStarted, v.docOwnerIsOurs, v.transferInProgress, v.saleTransferPending).tone}>{crlvBadge(v.hasCrlv, v.crlvYear, v.transferStarted, v.docOwnerIsOurs, v.transferInProgress, v.saleTransferPending).label}</Badge>
        </span>
        {v.hasAtpv ? (
          <span className="mt-1 block">
            <Badge tone="success">✓ ATPV-e</Badge>
          </span>
        ) : null}
        {v.renavePendentes > 0 ? (
          <span className="mt-1 block" title="Faltam dados para escriturar no Renave (só aviso)">
            <Badge tone="warning">📒 Renave: {v.renavePendentes} dado(s)</Badge>
          </span>
        ) : null}
        {v.hasTransferQuote ? (
          <span className="mt-1 block">
            <Badge tone="success">✓ Orçamento transf.</Badge>
          </span>
        ) : null}
        {v.status !== "VENDIDO" ? (
          <span className="mt-1 block">
            {(() => {
              const b = vitrineBadge(v.published, v.status, v.preSaleNumber != null);
              return <Badge tone={b.tone}>{b.label}</Badge>;
            })()}
          </span>
        ) : null}
        {v.status === "VENDIDO" ? (
          <span className="mt-1 flex flex-col items-start gap-1">
            <Badge tone={v.hasComunicacao ? "success" : "warning"}>
              {v.hasComunicacao ? "✓ Comunicação de venda" : "⚠ Comunicação pendente"}
            </Badge>
            <Badge tone={v.hasFotoCliente ? "success" : "warning"}>
              {v.hasFotoCliente ? "✓ Foto do cliente" : "⚠ Foto do cliente pendente"}
            </Badge>
            <Badge tone={v.transferDoneAt ? "success" : "danger"}>
              {v.transferDoneAt
                ? `✓ Transferido em ${formatDate(v.transferDoneAt)}`
                : "⚠ No nome do dono anterior"}
            </Badge>
          </span>
        ) : null}
      </Td>
      <Td>
        <Link href={`/estoque/${v.id}`} className="text-sm font-medium text-blue-700 hover:underline">
          Ver detalhes
        </Link>
      </Td>
    </Tr>
  );

  // A divisória só aparece quando os dois grupos existem na tela.
  const showDivider = emEstoque.length > 0 && vendidos.length > 0;

  return (
    <div>
      <PageHeader
        title="Estoque de veículos"
        description={
          `${emEstoque.length} em estoque${vendidos.length > 0 ? ` · ${vendidos.length} vendido(s)` : ""}` +
          (canVerCusto
            ? ` · pago: ${formatCurrency(totalPaid)} · custo total: ${formatCurrency(totalInvested)}`
            : "") +
          ` · valor anunciado: ${formatCurrency(totalValue)}`
        }
        action={
          <Can module="estoque" action="criar">
            <LinkButton href="/estoque/novo">+ Novo veículo</LinkButton>
          </Can>
        }
      />

      <ReportToolbar
        basePath="/estoque"
        printTitle="Estoque de veículos"
        q={q}
        placeholder="Buscar (marca, placa, cor, ano, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
        filtersKey={`${params.status ?? ""}|${params.doc ?? ""}`}
        pdf={canPdfCusto}
        actions={
          emEstoque.length > 0 ? (
            <PrintButton
              title="Estoque — ficha de venda"
              mode="table"
              rootSelector="#pdf-vendedor"
              label="📄 PDF vendedor"
              subtitle={`${emEstoque.length} veículo(s) disponível(is) para venda`}
            />
          ) : null
        }
        extra={
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Status
              <Select name="status" defaultValue={params.status || "TODOS"} className="mt-0.5 h-11 w-44">
                <option value="TODOS">Todos os status</option>
                <option value="ESTOQUE">Em estoque</option>
                <option value="PRE_VENDIDO">Pré-vendido</option>
                <option value="VENDIDO">Vendido</option>
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Documentação
              <Select name="doc" defaultValue={params.doc || "TODOS"} className="mt-0.5 h-11 w-56">
                <option value="TODOS">Toda a documentação</option>
                <option value="TRANSFERENCIA">Em processo de transferência</option>
                <option value="ORCAMENTO">Com orçamento de transferência</option>
                <option value="TRANSFERIDO">Transferido (CRLV no nome da loja)</option>
                <option value="CRLV_PENDENTE">CRLV pendente</option>
                <option value="ATPV">Com ATPV-e</option>
                <option value="RENAVE_PENDENTE">Renave: dados faltando</option>
              </Select>
            </label>
          </div>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum veículo encontrado"
            description="Cadastre o primeiro veículo do estoque para começar."
            action={
              <Can module="estoque" action="criar">
                <LinkButton href="/estoque/novo">+ Novo veículo</LinkButton>
              </Can>
            }
          />
        </Card>
      ) : (
        <>
          {/* Celular: cards */}
          <div className="space-y-3 md:hidden">
            {emEstoque.map(renderCard)}
            {showDivider ? (
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Vendidos ({vendidos.length})
              </p>
            ) : null}
            {vendidos.map(renderCard)}
          </div>

          {/* Computador: tabela */}
          <Card className="hidden md:block">
            <Table>
              <Thead>
                <Tr>
                  <Th>Veículo</Th>
                  <Th>Placa</Th>
                  <Th>Cor</Th>
                  <Th>Ano</Th>
                  <Th>KM</Th>
                  {canVerCusto ? <Th className="text-right">Custo pago</Th> : null}
                  <Th className="text-right">Preço de venda</Th>
                  <Th className="text-right">Dias</Th>
                  <Th>Status</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {emEstoque.map(renderRow)}
                {showDivider ? (
                  <tr className="bg-slate-50">
                    <td
                      colSpan={canVerCusto ? 10 : 9}
                      className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
                    >
                      Vendidos ({vendidos.length})
                    </td>
                  </tr>
                ) : null}
                {vendidos.map(renderRow)}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {/*
        Origem do "PDF vendedor": os dados que o vendedor precisa na mão, SEM
        custo, margem ou dias em estoque. Fica fora da tela (hidden) e fora do
        PDF completo (data-no-pdf) — o PrintButton aponta direto para este id.
        Só os veículos disponíveis: carro vendido não entra em ficha de venda.
      */}
      {emEstoque.length > 0 ? (
        <div id="pdf-vendedor" data-no-pdf className="hidden print:hidden">
          <table>
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Placa</th>
                <th>Ano</th>
                <th className="text-right">KM</th>
                <th>Cor</th>
                <th>Câmbio</th>
                <th>Combustível</th>
                <th className="text-right">Preço de venda</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {emEstoque.map((v) => (
                <tr key={v.id}>
                  <td>{vehicleLabel(v.brand, v.model, v.version)}</td>
                  <td>{v.plate}</td>
                  <td>
                    {v.manufactureYear}/{v.modelYear}
                  </td>
                  <td className="text-right">{v.km.toLocaleString("pt-BR")}</td>
                  <td>{v.color || "-"}</td>
                  <td>{v.transmission || "-"}</td>
                  <td>{v.fuel || "-"}</td>
                  <td className="text-right">{formatCurrency(v.salePrice)}</td>
                  <td>
                    {v.preSaleNumber != null
                      ? `Pré-vendido nº ${String(v.preSaleNumber).padStart(4, "0")}`
                      : statusLabel[v.status].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
