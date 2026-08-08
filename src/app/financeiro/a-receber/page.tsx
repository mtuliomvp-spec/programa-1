import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { ensureRecurringGeneratedForPage } from "@/lib/recurring";
import { getActiveAccounts } from "@/lib/accounts";
import { getCashboxState } from "@/lib/cashbox";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveReceivableStatus } from "@/lib/status";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Card, EmptyState, LinkButton, PageHeader, Select } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import ReceivablesTable, { type ReceivableRow } from "./ReceivablesTable";

export const dynamic = "force-dynamic";

const categoryLabel = { VENDA_VEICULO: "Venda de veículo", VENDA_PECA: "Venda de peça", RETORNO_FINANCEIRA: "Retorno financeira", OUTROS: "Outros" } as const;
const statusLabelMap = { PENDENTE: "Pendente", RECEBIDO: "Recebido", ATRASADO: "Atrasado" } as const;

export default async function ContasAReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; de?: string; ate?: string; min?: string; max?: string; p?: string }>;
}) {
  const { status: statusFilter, q: qParam, de, ate, min, max, p: pParam } = await searchParams;
  const q = (qParam || "").trim();
  const [canReceber, canManage, canEditOnly, canDiscount] = await Promise.all([
    userCan("financeiro", "receber"),
    userCan("financeiro", "criar"),
    userCan("financeiro", "editar"),
    userCan("financeiro", "desconto"),
  ]);
  // Link "Editar" da linha: lançadores OU quem tem só a permissão de editar.
  const canEdit = canManage || canEditOnly;
  await ensureRecurringGeneratedForPage();

  const [receivables, accounts, cashbox] = await timed("tela: contas a receber", () =>
    Promise.all([
      // `select` enxuto: só o que a tabela mostra (o include trazia a linha
      // inteira do cliente por título).
      prisma.receivable.findMany({
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          description: true,
          category: true,
          categoryLabel: true,
          amount: true,
          dueDate: true,
          status: true,
          saleId: true,
          partSaleId: true,
          recurringId: true,
          vehicleId: true,
          // Desconto concedido vira custo pós-venda do carro da venda.
          sale: { select: { vehicleId: true } },
          customer: { select: { name: true } },
          account: { select: { name: true } },
        },
      }),
      getActiveAccounts(),
      getCashboxState(),
    ]),
  );
  // Data em que as baixas vão cair (data de trabalho do caixa aberto).
  const cashboxDate = cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : null;

  const withStatus = receivables.map((r) => ({ ...r, effective: effectiveReceivableStatus(r.status, r.dueDate) }));
  const byStatus = statusFilter && statusFilter !== "TODOS" ? withStatus.filter((r) => r.effective === statusFilter) : withStatus;
  // Busca livre + intervalo de vencimento + faixa de valor.
  const filtered = byStatus.filter(
    (r) =>
      matchesSearch(
        q,
        r.description,
        r.categoryLabel || categoryLabel[r.category],
        r.customer?.name,
        formatDate(r.dueDate),
        r.amount,
        formatCurrency(r.amount),
        statusLabelMap[r.effective],
        r.account?.name,
      ) &&
      inDateRange(r.dueDate, de, ate) &&
      inValueRange(r.amount, min, max),
  );
  // Igual a Contas a pagar: recebidos vão para o fim; atrasados e pendentes
  // primeiro (dentro de cada grupo, o vencimento asc já traz os atrasados antes).
  filtered.sort((a, b) => (a.effective === "RECEBIDO" ? 1 : 0) - (b.effective === "RECEBIDO" ? 1 : 0));

  const totalPendente = withStatus.filter((r) => r.effective !== "RECEBIDO").reduce((s, r) => s + r.amount, 0);
  const totalAtrasado = withStatus.filter((r) => r.effective === "ATRASADO").reduce((s, r) => s + r.amount, 0);

  // Linhas prontas para a tabela (client): só campos serializáveis.
  const tableRows: ReceivableRow[] = filtered.map((r) => ({
    id: r.id,
    description: r.description,
    categoryLabel: r.categoryLabel || categoryLabel[r.category],
    customerName: r.customer?.name ?? null,
    dueDate: r.dueDate.toISOString(),
    amount: r.amount,
    status: r.status,
    effective: r.effective,
    // Editar/excluir: manuais e ainda não recebidos. Recorrente É editável
    // (o vencimento é que fica travado, na própria tela de edição).
    hasVehicle: Boolean(r.vehicleId ?? r.sale?.vehicleId),
    editable: r.status !== "RECEBIDO" && !r.saleId && !r.partSaleId,
    originHint:
      r.status === "RECEBIDO"
        ? "Título já recebido — use Reverter antes de editar ou excluir."
        : r.saleId
          ? "Este título veio de uma venda: ajuste na venda de origem."
          : r.partSaleId
            ? "Este título veio de uma venda de peça: ajuste na venda de origem."
            : null,
  }));

  // Página de 100 linhas (busca e filtros continuam valendo sobre todos).
  const PER_PAGE = 100;
  const totalRows = tableRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / PER_PAGE));
  const currentPage = Math.min(Math.max(1, Number(pParam) || 1), pageCount);
  const pageStart = (currentPage - 1) * PER_PAGE;
  const pageRows = tableRows.slice(pageStart, pageStart + PER_PAGE);
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: statusFilter, q, de, ate, min, max })) {
      if (v) sp.set(k, String(v));
    }
    if (n > 1) sp.set("p", String(n));
    const qs = sp.toString();
    return qs ? `/financeiro/a-receber?${qs}` : "/financeiro/a-receber";
  };

  return (
    <div>
      <PageHeader
        title="Contas a receber"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={
          <Can module="financeiro" action="criar">
            <LinkButton href="/financeiro/a-receber/novo">+ Nova conta</LinkButton>
          </Can>
        }
      />

      <ReportToolbar
        basePath="/financeiro/a-receber"
        printTitle="Contas a receber"
        q={q}
        placeholder="Buscar (descrição, cliente, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
        filtersKey={`${statusFilter ?? ""}`}
        extra={
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Status
            <Select name="status" defaultValue={statusFilter || "TODOS"} className="mt-0.5 w-48">
              <option value="TODOS">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="ATRASADO">Atrasado</option>
              <option value="RECEBIDO">Recebido</option>
            </Select>
          </label>
        }
      />

      <Card>
        {tableRows.length === 0 ? (
          <EmptyState title={q ? "Nada encontrado para a busca" : "Nenhuma conta a receber encontrada"} />
        ) : (
          <>
            {canReceber ? (
              <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
                Marque um ou vários títulos, escolha a conta e receba de uma vez (em lote).
              </p>
            ) : null}
            <ReceivablesTable
              rows={pageRows}
              accounts={accounts}
              canReceber={canReceber}
              canManage={canManage}
              canEdit={canEdit}
              canDiscount={canDiscount}
              cashboxDate={cashboxDate}
            />
            {pageCount > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 print:hidden">
                <p className="text-xs text-slate-500">
                  Mostrando {pageStart + 1}-{pageStart + pageRows.length} de {totalRows} título(s)
                  {" · "}página {currentPage} de {pageCount}
                </p>
                <div className="flex gap-2">
                  {currentPage > 1 ? (
                    <LinkButton href={pageHref(currentPage - 1)} variant="secondary">
                      ← Anterior
                    </LinkButton>
                  ) : null}
                  {currentPage < pageCount ? (
                    <LinkButton href={pageHref(currentPage + 1)} variant="secondary">
                      Próxima →
                    </LinkButton>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
