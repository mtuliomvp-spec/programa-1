import Link from "next/link";
import { timed } from "@/lib/perf";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { daysBetween } from "@/lib/reports";
import { Badge, Card, EmptyState, LinkButton, Select, Table, Td, Th, Thead, Tr, PageHeader } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";
import PrintButton from "@/components/PrintButton";
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

/** Texto do selo de CRLV no card (com o ano em exercício quando anexado). */
function crlvBadgeLabel(hasCrlv: boolean, year: string | null): string {
  return hasCrlv ? `✓ CRLV${year ? ` ${year}` : ""}` : "⚠ CRLV pendente";
}

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const params = await searchParams;
  const { de, ate, min, max } = params;
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
  const [canVerCusto, canPdfCusto] = await Promise.all([
    userCan("estoque", "vercusto"),
    userCan("estoque", "pdfcusto"),
  ]);

  const [vehicles, openPreSales] = await timed("tela: estoque", () =>
    Promise.all([
      prisma.vehicle.findMany({
        where: { status, intermediation: false },
        include: {
          costs: { select: { amount: true } },
          payables: { select: { amount: true, status: true } },
          // Só precisa saber SE há comunicação de venda e foto do cliente anexadas.
          attachments: { select: { kind: true, description: true } },
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
    ]),
  );

  // vehicleId → número da pré-venda aberta mais recente (ordenado desc: 1º = maior).
  const preSaleByVehicle = new Map<string, number>();
  for (const ps of openPreSales) {
    if (!preSaleByVehicle.has(ps.vehicleId)) preSaleByVehicle.set(ps.vehicleId, ps.number);
  }

  const allRows = vehicles.map((v) => ({
    ...v,
    preSaleNumber: preSaleByVehicle.get(v.id) ?? null,
    hasComunicacao: v.attachments.some((a) => /comunica/i.test(a.description)),
    hasFotoCliente: v.attachments.some((a) => a.kind === "FOTO_CLIENTE"),
    hasCrlv: v.attachments.some((a) => a.kind === "CRLV"),
    // Transferência no DETRAN concluída (só faz sentido em veículo vendido).
    transferDoneAt: v.sale?.transferDoneAt ?? null,
    // Ano em exercício do CRLV mais recente (guardado no description "CRLV 2025").
    crlvYear:
      v.attachments
        .filter((a) => a.kind === "CRLV")
        .map((a) => a.description.match(/(\d{4})/)?.[1] ?? "")
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    invested: v.purchasePrice + v.costs.reduce((sum, c) => sum + c.amount, 0),
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
  }));

  // Filtro derivado "Pré-vendido": em estoque (não vendido) e com pré-venda aberta.
  const statusFiltered = preVendidoFilter
    ? allRows.filter((v) => v.status !== "VENDIDO" && v.preSaleNumber != null)
    : allRows;

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
      inValueRange(v.salePrice, min, max),
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
                  <span className="text-rose-500">falta {formatCurrency(v.pendingCost)}</span>
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
            <Badge tone={v.hasCrlv ? "success" : "warning"}>{crlvBadgeLabel(v.hasCrlv, v.crlvYear)}</Badge>
            <Badge tone={agingTone(v.daysInStock)}>{v.daysInStock} dias em estoque</Badge>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <Badge tone={v.hasCrlv ? "success" : "warning"}>{crlvBadgeLabel(v.hasCrlv, v.crlvYear)}</Badge>
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
              <span className="text-rose-500">falta {formatCurrency(v.pendingCost)}</span>
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
          <Badge tone={v.hasCrlv ? "success" : "warning"}>{crlvBadgeLabel(v.hasCrlv, v.crlvYear)}</Badge>
        </span>
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
        filtersKey={`${params.status ?? ""}`}
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
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Status
            <Select name="status" defaultValue={params.status || "TODOS"} className="mt-0.5 w-44">
              <option value="TODOS">Todos os status</option>
              <option value="ESTOQUE">Em estoque</option>
              <option value="PRE_VENDIDO">Pré-vendido</option>
              <option value="VENDIDO">Vendido</option>
            </Select>
          </label>
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
