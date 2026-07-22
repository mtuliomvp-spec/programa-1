import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { daysBetween } from "@/lib/reports";
import { Badge, Card, EmptyState, LinkButton, Select, Table, Td, Th, Thead, Tr, PageHeader } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
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

  const [vehicles, openPreSales] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status, intermediation: false },
      include: {
        costs: { select: { amount: true } },
        payables: { select: { amount: true, status: true } },
        // Só precisa saber SE há comunicação de venda e foto do cliente anexadas.
        attachments: { select: { kind: true, description: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Pré-vendas em aberto: o veículo continua no estoque, mas já está pré-vendido.
    prisma.preSale.findMany({
      where: { status: "ABERTA" },
      select: { vehicleId: true, number: true },
      orderBy: { number: "desc" },
    }),
  ]);

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
    invested: v.purchasePrice + v.costs.reduce((sum, c) => sum + c.amount, 0),
    // Custo real = tudo o que já foi efetivamente PAGO por esse veículo
    // (aquisição + manutenção/custos), pela conta financeira.
    paidCost: v.payables.filter((p) => p.status === "PAGO").reduce((s, p) => s + p.amount, 0),
    // O que ainda falta pagar desse veículo (ex.: quitação/débitos da troca).
    pendingCost: v.payables
      .filter((p) => p.status === "PENDENTE" || p.status === "ATRASADO")
      .reduce((s, p) => s + p.amount, 0),
    daysInStock: daysBetween(v.entryDate, now),
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
      ) &&
      inDateRange(v.entryDate, de, ate) &&
      inValueRange(v.salePrice, min, max),
  );

  const active = rows.filter((v) => v.status !== "VENDIDO");
  const totalValue = active.reduce((sum, v) => sum + v.salePrice, 0);
  const totalInvested = active.reduce((sum, v) => sum + v.invested, 0);
  const totalPaid = active.reduce((sum, v) => sum + v.paidCost, 0);

  return (
    <div>
      <PageHeader
        title="Estoque de veículos"
        description={`${rows.length} veículo(s) · pago: ${formatCurrency(totalPaid)} · custo total: ${formatCurrency(totalInvested)} · valor anunciado: ${formatCurrency(totalValue)}`}
        action={<LinkButton href="/estoque/novo">+ Novo veículo</LinkButton>}
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
        extra={
          <label className="text-xs text-slate-500">
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
            action={<LinkButton href="/estoque/novo">+ Novo veículo</LinkButton>}
          />
        </Card>
      ) : (
        <>
          {/* Celular: cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((v) => (
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
                      {v.status !== "VENDIDO" && v.preSaleNumber != null ? (
                        <Badge tone="warning">🤝 Pré-vendido nº {String(v.preSaleNumber).padStart(4, "0")}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
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
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Preço</p>
                      <p className="text-base font-bold text-slate-900">{formatCurrency(v.salePrice)}</p>
                    </div>
                  </div>
                  {v.status !== "VENDIDO" ? (
                    <div className="mt-2 flex justify-end">
                      <Badge tone={agingTone(v.daysInStock)}>{v.daysInStock} dias em estoque</Badge>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      <Badge tone={v.hasComunicacao ? "success" : "warning"}>
                        {v.hasComunicacao ? "✓ Comunicação de venda" : "⚠ Comunicação de venda pendente"}
                      </Badge>
                      <Badge tone={v.hasFotoCliente ? "success" : "warning"}>
                        {v.hasFotoCliente ? "✓ Foto do cliente" : "⚠ Foto do cliente pendente"}
                      </Badge>
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>

          {/* Computador: tabela */}
          <Card className="hidden md:block">
            <Table>
              <Thead>
                <Tr>
                  <Th>Veículo</Th>
                  <Th>Placa</Th>
                  <Th>Ano</Th>
                  <Th>KM</Th>
                  <Th className="text-right">Custo pago</Th>
                  <Th className="text-right">Preço de venda</Th>
                  <Th className="text-right">Dias</Th>
                  <Th>Status</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {rows.map((v) => (
                  <Tr key={v.id}>
                    <Td className="font-medium text-slate-900">
                      {v.brand} {v.model} {v.version ? <span className="text-slate-400">{v.version}</span> : null}
                    </Td>
                    <Td>{v.plate}</Td>
                    <Td>
                      {v.manufactureYear}/{v.modelYear}
                    </Td>
                    <Td>{v.km.toLocaleString("pt-BR")} km</Td>
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
                      {v.status !== "VENDIDO" && v.preSaleNumber != null ? (
                        <span className="mt-1 block">
                          <Badge tone="warning">🤝 Pré-vendido nº {String(v.preSaleNumber).padStart(4, "0")}</Badge>
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
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Link href={`/estoque/${v.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                        Ver detalhes
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
