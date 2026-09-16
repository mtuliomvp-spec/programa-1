import Link from "next/link";
import { timed } from "@/lib/perf";
import { pendenciasCobraveis, detranOperando } from "@/lib/renave";
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
import { visitasPorVeiculo } from "@/lib/showroom-visits";
import { nameKey } from "@/lib/person-keys";
import { situacaoDocumental, seloCrlv } from "@/lib/doc-owner";
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
          // customer: confere se o CRLV mais recente já está no nome do comprador.
          sale: {
            select: {
              saleDate: true,
              transferDoneAt: true,
              customer: { select: { name: true, document: true } },
            },
          },
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
        select: { razaoSocial: true, nomeFantasia: true, detranRenaveStatus: true },
      }),
      prisma.capitalBeneficiary.findMany({ select: { name: true } }),
    ]),
  );

  // Sem o Renave no ar no estado, o selo cobra só o que está ao alcance da loja.
  const renaveOperando = detranOperando(company?.detranRenaveStatus);

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

  // Visitas ao anúncio de todos os veículos da tela, em duas consultas
  // agregadas (nunca uma por linha).
  const visitas = await visitasPorVeiculo(vehicles.map((v) => v.id));

  const allRows = vehicles.map((v) => ({
    ...v,
    // CRLV, orçamento, comunicação de venda, foto do cliente e situação da
    // transferência: as MESMAS regras da ficha e do financiamento de terceiros.
    ...situacaoDocumental({ ...v, preVendido: preSaleByVehicle.has(v.id) }, houseKeys),
    preSaleNumber: preSaleByVehicle.get(v.id) ?? null,
    // Renave: quantos dados ainda faltam para escriturar este veículo. Só selo
    // — a lista e as ações continuam iguais durante a implantação.
    renavePendentes: pendenciasCobraveis(v, renaveOperando).length,
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
    // Visitas ao anúncio na vitrine (0 para quem nunca foi publicado).
    visitas: visitas.get(v.id)?.total ?? 0,
    visitas7: visitas.get(v.id)?.ultimos7 ?? 0,
    contatos: visitas.get(v.id)?.contatos ?? 0,
    receivedInTrade: v.tradeInForSale != null,
    tradeOrigin: v.tradeInForSale
      ? `Recebido em troca na venda #${String(v.tradeInForSale.orderNumber).padStart(4, "0")}` +
        (v.tradeInForSale.vehicle
          ? ` (${v.tradeInForSale.vehicle.brand} ${v.tradeInForSale.vehicle.model} - ${v.tradeInForSale.vehicle.plate})`
          : "")
      : null,
  }));

  // Filtro derivado "Pré-vendido": em estoque (não vendido) e com pré-venda aberta.
  const statusFiltered = preVendidoFilter
    ? allRows.filter((v) => v.status !== "VENDIDO" && v.preSaleNumber != null)
    : allRows;

  // Situação de documentação: usa o MESMO selo do card (crlvBadge) para casar
  // com o que o usuário vê. "Transferido" também inclui a baixa concluída no
  // DETRAN (transferDoneAt) dos vendidos.
  const docMatch = (v: (typeof allRows)[number]): boolean => {
    if (!docFilter) return true;
    const badge = seloCrlv(v);
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
    <Link key={v.id} href={`/estoque/${v.id}`} className="block h-full">
      <Card className="flex h-full flex-col px-4 py-3.5 transition-shadow active:shadow-md">
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
                <strong className={v.docOwnerOk ? "text-emerald-600" : "text-rose-600"}>
                  {v.docOwnerName}
                </strong>
              </p>
            ) : null}
            {v.transferToName && !v.transferDoneAt ? (
              <p className="mt-0.5 truncate text-[11px] text-sky-700">
                🔄 Transferência para <strong>{v.transferToName}</strong>
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
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
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
            <Badge tone={seloCrlv(v).tone}>{seloCrlv(v).label}</Badge>
            {v.hasAtpv ? <Badge tone="success">✓ ATPV-e</Badge> : null}
            {v.renavePendentes > 0 ? (
              <Badge tone="warning">📒 Renave: {v.renavePendentes} dado(s)</Badge>
            ) : null}
            {v.hasTransferQuote ? <Badge tone="success">✓ Orçamento transf.</Badge> : null}
            {(() => {
              const b = vitrineBadge(v.published, v.status, v.preSaleNumber != null);
              return <Badge tone={b.tone}>{b.label}</Badge>;
            })()}
            {v.visitas > 0 ? (
              <Badge tone="info">
                👁️ {v.visitas} visitas{v.contatos > 0 ? ` · 💬 ${v.contatos}` : ""}
              </Badge>
            ) : null}
            <Badge tone={agingTone(v.daysInStock)}>{v.daysInStock} dias em estoque</Badge>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <Badge tone={seloCrlv(v).tone}>{seloCrlv(v).label}</Badge>
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
                ? v.transferDoneByCrlv
                  ? "✓ Transferido · CRLV no nome do comprador"
                  : `✓ Transferido em ${formatDate(v.transferDoneAt)}`
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
        <Link href={`/estoque/${v.id}`} className="text-blue-700 hover:underline">
          {v.brand} {v.model} {v.version ? <span className="text-slate-400">{v.version}</span> : null}
        </Link>
        <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
          {v.plate}
          {v.color ? ` · ${v.color}` : ""}
        </span>
        {v.docOwnerName ? (
          <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
            Este veículo está em nome de{" "}
            <strong className={v.docOwnerOk ? "text-emerald-600" : "text-rose-600"}>
              {v.docOwnerName}
            </strong>
          </span>
        ) : null}
        {v.transferToName && !v.transferDoneAt ? (
          <span className="mt-0.5 block text-[11px] font-normal text-sky-700">
            🔄 Transferência para <strong>{v.transferToName}</strong>
          </span>
        ) : null}
      </Td>
      <Td className="whitespace-nowrap">
        {v.manufactureYear}/{v.modelYear}
        <span className="block text-[11px] text-slate-400">{v.km.toLocaleString("pt-BR")} km</span>
      </Td>
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
      <Td className="whitespace-nowrap text-right tabular-nums">
        {v.visitas > 0 ? (
          <span title="Visitas ao anúncio na vitrine · contatos pelo WhatsApp">
            {v.visitas}
            {v.visitas7 > 0 ? (
              <span className="block text-[11px] text-slate-400">{v.visitas7} em 7 dias</span>
            ) : null}
            {v.contatos > 0 ? (
              <span className="block text-[11px] font-medium text-emerald-700">💬 {v.contatos}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </Td>
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
          <Badge tone={seloCrlv(v).tone}>{seloCrlv(v).label}</Badge>
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
                ? v.transferDoneByCrlv
                  ? "✓ Transferido · CRLV no nome do comprador"
                  : `✓ Transferido em ${formatDate(v.transferDoneAt)}`
                : "⚠ No nome do dono anterior"}
            </Badge>
          </span>
        ) : null}
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
          {/*
            Celular e tablet: cards. O tablet (Samsung, ~1200 px) ainda perde
            256 px para o menu lateral, e a tabela de 8 colunas não cabe no que
            sobra — obrigava a rolar de lado. Até xl (1280 px) vale a lista em
            cards, em duas colunas quando há largura para isso.
          */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {emEstoque.map(renderCard)}
            {showDivider ? (
              <p className="col-span-full pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Vendidos ({vendidos.length})
              </p>
            ) : null}
            {vendidos.map(renderCard)}
          </div>

          {/* Computador: tabela */}
          <Card className="hidden xl:block">
            <Table>
              <Thead>
                <Tr>
                  <Th>Veículo</Th>
                  <Th>Ano / KM</Th>
                  {canVerCusto ? <Th className="text-right">Custo pago</Th> : null}
                  <Th className="text-right">Preço de venda</Th>
                  <Th className="text-right">Visitas</Th>
                  <Th className="text-right">Dias</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <tbody>
                {emEstoque.map(renderRow)}
                {showDivider ? (
                  <tr className="bg-slate-50">
                    <td
                      colSpan={canVerCusto ? 7 : 6}
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
