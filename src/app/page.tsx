import Link from "next/link";
import { getDashboardStats, getUpcomingDue, getCashFlowLastMonths } from "@/lib/queries";
import { getPerformanceStats } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import CashFlowChart from "@/components/CashFlowChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, upcoming, monthly, perf] = await Promise.all([
    getDashboardStats(),
    getUpcomingDue(7),
    getCashFlowLastMonths(6),
    getPerformanceStats(),
  ]);

  type UpcomingItem = {
    kind: "pagar" | "receber";
    id: string;
    description: string;
    dueDate: Date;
    amount: number;
    who: string;
  };

  const items: UpcomingItem[] = [
    ...upcoming.payables.map((p) => ({
      kind: "pagar" as const,
      id: p.id,
      description: p.description,
      dueDate: p.dueDate,
      amount: p.amount,
      who: p.supplier?.name || "-",
    })),
    ...upcoming.receivables.map((r) => ({
      kind: "receber" as const,
      id: r.id,
      description: r.description,
      dueDate: r.dueDate,
      amount: r.amount,
      who: r.customer?.name || "-",
    })),
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral da MVP Veículos: estoque, vendas e financeiro"
        action={
          <Link href="/relatorios" className="text-sm font-medium text-blue-700 hover:underline">
            Ver relatórios completos →
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Veículos em estoque"
          value={String(stats.vehiclesInStockCount)}
          hint={`${formatCurrency(stats.vehiclesInStockValue)} em valor de venda${stats.vehiclesReservedCount ? ` · ${stats.vehiclesReservedCount} reservado(s)` : ""}`}
        />
        <StatCard
          label="Vendas no mês"
          value={String(stats.salesThisMonthCount)}
          hint={formatCurrency(stats.salesThisMonthValue)}
          tone="positive"
        />
        <StatCard
          label="Contas a pagar"
          value={formatCurrency(stats.payablesPendingTotal)}
          hint={stats.payablesOverdueCount > 0 ? `${stats.payablesOverdueCount} atrasada(s) · ${formatCurrency(stats.payablesOverdueTotal)}` : `${stats.payablesPendingCount} pendente(s)`}
          tone={stats.payablesOverdueCount > 0 ? "negative" : "default"}
        />
        <StatCard
          label="Contas a receber"
          value={formatCurrency(stats.receivablesPendingTotal)}
          hint={stats.receivablesOverdueCount > 0 ? `${stats.receivablesOverdueCount} atrasada(s) · ${formatCurrency(stats.receivablesOverdueTotal)}` : `${stats.receivablesPendingCount} pendente(s)`}
          tone={stats.receivablesOverdueCount > 0 ? "negative" : "default"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Lucro do mês (veículos)"
          value={formatCurrency(perf.profitThisMonth)}
          tone={perf.profitThisMonth >= 0 ? "positive" : "negative"}
          hint="vendas menos compra + custos"
        />
        <StatCard label="Ticket médio do mês" value={formatCurrency(perf.avgTicket)} />
        <StatCard
          label="Capital imobilizado"
          value={formatCurrency(perf.investedInStock)}
          hint="investido nos veículos em estoque"
        />
        <StatCard
          label="Tempo médio em estoque"
          value={`${perf.avgDaysInStock} dias`}
          tone={perf.avgDaysInStock > 60 ? "warning" : "default"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Fluxo de caixa"
            description="Entradas x saídas realizadas, últimos 6 meses"
            action={
              <Link href="/financeiro/fluxo-caixa" className="text-sm font-medium text-slate-900 hover:underline">
                Ver completo →
              </Link>
            }
          />
          <div className="p-5">
            <CashFlowChart data={monthly} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Próximos vencimentos" description="Nos próximos 7 dias" />
          {items.length === 0 ? (
            <EmptyState title="Nenhum vencimento próximo" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 8).map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.description}</p>
                    <p className="text-xs text-slate-400">
                      {item.who} · {formatDate(item.dueDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${item.kind === "pagar" ? "text-rose-600" : "text-emerald-600"}`}>
                      {formatCurrency(item.amount)}
                    </p>
                    <Badge tone={item.kind === "pagar" ? "danger" : "info"}>{item.kind === "pagar" ? "A pagar" : "A receber"}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {stats.partsLowStockCount > 0 ? (
        <div className="mt-4">
          <Card className="border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{stats.partsLowStockCount} peça(s)</span> com estoque abaixo do mínimo.{" "}
              <Link href="/pecas" className="font-medium underline">
                Ver peças
              </Link>
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
