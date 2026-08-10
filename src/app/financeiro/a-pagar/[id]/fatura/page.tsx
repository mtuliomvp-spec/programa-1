import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { matchesSearch, inValueRange } from "@/lib/search";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";

export const dynamic = "force-dynamic";

const flowLabel = {
  ADMINISTRATIVO: "Administrativo",
  VEICULOS: "Veículos",
  CAPITAL: "Capital",
} as const;
const flowTone = { ADMINISTRATIVO: "default", VEICULOS: "info", CAPITAL: "success" } as const;
const statusText = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

/**
 * Relatório imprimível da fatura do cartão: lista os lançamentos do título com
 * busca livre e filtros por sócio/veículo e fluxo. O botão PDF usa a impressão
 * do navegador — sai só a tabela filtrada, com cabeçalho e total.
 */
export default async function FaturaCartaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; quem?: string; fluxo?: string; min?: string; max?: string }>;
}) {
  const { id } = await params;
  const { q: qParam, quem, fluxo, min, max } = await searchParams;
  const q = (qParam || "").trim();

  const payable = await prisma.payable.findUnique({
    where: { id },
    include: {
      cardItems: {
        orderBy: { createdAt: "asc" },
        include: {
          vehicle: { select: { brand: true, model: true, plate: true } },
          capitalBeneficiary: { select: { name: true } },
        },
      },
    },
  });
  if (!payable || !payable.cardInvoice) notFound();

  const rows = payable.cardItems.map((i) => ({
    id: i.id,
    description: i.description,
    amount: i.amount,
    flow: flowLabel[i.structuralKey as keyof typeof flowLabel] || i.structuralKey,
    flowKey: i.structuralKey,
    who: i.vehicle
      ? `${i.vehicle.brand} ${i.vehicle.model} · ${i.vehicle.plate}`
      : i.capitalBeneficiary?.name || "—",
  }));

  // Opções do filtro "Quem": os sócios/veículos que aparecem nos lançamentos.
  const whoOptions = [...new Set(rows.map((r) => r.who))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const filtered = rows.filter(
    (r) =>
      matchesSearch(q, r.description, r.flow, r.who, r.amount, formatCurrency(r.amount)) &&
      (!quem || r.who === quem) &&
      (!fluxo || r.flowKey === fluxo) &&
      inValueRange(r.amount, min, max),
  );
  const totalFiltrado = filtered.reduce((s, r) => s + r.amount, 0);
  const totalFatura = rows.reduce((s, r) => s + r.amount, 0);
  const isFiltered = filtered.length !== rows.length;

  const status = effectivePayableStatus(payable.status, payable.dueDate);
  const filtroResumo = [
    quem ? `Quem: ${quem}` : null,
    fluxo ? `Fluxo: ${flowLabel[fluxo as keyof typeof flowLabel] || fluxo}` : null,
    q ? `Busca: "${q}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={payable.description}
          description={`Vencimento ${formatDate(payable.dueDate)} · ${statusText[status]} · ${rows.length} lançamento(s) · total ${formatCurrency(totalFatura)}`}
          action={
            // Título pago não abre a tela de edição — volta direto para a lista.
            status === "PAGO" ? (
              <LinkButton href="/financeiro/a-pagar" variant="secondary">
                ← Contas a pagar
              </LinkButton>
            ) : (
              <LinkButton href={`/financeiro/a-pagar/${payable.id}/editar`} variant="secondary">
                ← Voltar ao título
              </LinkButton>
            )
          }
        />
      </div>

      <ReportToolbar
        basePath={`/financeiro/a-pagar/${payable.id}/fatura`}
        printTitle={`${payable.description} — venc. ${formatDate(payable.dueDate)}`}
        q={q}
        placeholder="Buscar (lançamento, sócio, veículo, valor...)"
        value
        min={min}
        max={max}
        filtersKey={`${quem ?? ""}|${fluxo ?? ""}`}
        extra={
          <>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Quem (sócio / veículo)
              <Select name="quem" defaultValue={quem || ""} className="mt-0.5 h-11 w-56">
                <option value="">Todos</option>
                {whoOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Fluxo
              <Select name="fluxo" defaultValue={fluxo || ""} className="mt-0.5 h-11 w-44">
                <option value="">Todos os fluxos</option>
                <option value="ADMINISTRATIVO">Administrativo</option>
                <option value="VEICULOS">Veículos</option>
                <option value="CAPITAL">Capital</option>
              </Select>
            </label>
          </>
        }
      />

      {/* Na impressão, deixa registrado qual filtro gerou a lista. */}
      {filtroResumo ? (
        <p className="mb-2 hidden text-xs text-slate-500 print:block">Filtro aplicado — {filtroResumo}</p>
      ) : null}

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento encontrado"
            description="Ajuste a busca ou os filtros acima."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Lançamento</Th>
                <Th>Fluxo</Th>
                <Th>Quem</Th>
                <Th className="text-right">Valor</Th>
              </Tr>
            </Thead>
            <tbody>
              {filtered.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.description}</Td>
                  <Td>
                    <Badge tone={flowTone[r.flowKey as keyof typeof flowTone] || "default"}>
                      {r.flow}
                    </Badge>
                  </Td>
                  <Td>{r.who}</Td>
                  <Td className="text-right font-medium tabular-nums">{formatCurrency(r.amount)}</Td>
                </Tr>
              ))}
              <Tr className="bg-slate-50/80 font-semibold">
                <Td>
                  {isFiltered
                    ? `Total filtrado (${filtered.length} de ${rows.length} lançamentos)`
                    : `Total da fatura (${rows.length} lançamentos)`}
                </Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(totalFiltrado)}</Td>
              </Tr>
            </tbody>
          </Table>
        )}
      </Card>

      {isFiltered && filtered.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500 print:hidden">
          Total da fatura completa: {formatCurrency(totalFatura)} ({rows.length} lançamentos).
        </p>
      ) : null}
    </div>
  );
}
