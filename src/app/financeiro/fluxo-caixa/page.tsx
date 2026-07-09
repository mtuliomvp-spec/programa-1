import { getCashFlowLastMonths, getDashboardStats } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import CashFlowChart from "@/components/CashFlowChart";

export const dynamic = "force-dynamic";

export default async function FluxoCaixaPage() {
  const [monthly, stats] = await Promise.all([getCashFlowLastMonths(6), getDashboardStats()]);

  return (
    <div>
      <PageHeader title="Fluxo de caixa" description="Consolidado de entradas e saídas realizadas, últimos 6 meses" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recebido no mês" value={formatCurrency(stats.receivedThisMonth)} tone="positive" />
        <StatCard label="Pago no mês" value={formatCurrency(stats.paidThisMonth)} tone="negative" />
        <StatCard
          label="Saldo do mês"
          value={formatCurrency(stats.cashBalanceThisMonth)}
          tone={stats.cashBalanceThisMonth >= 0 ? "positive" : "negative"}
        />
      </div>

      <Card>
        <CardHeader title="Entradas x Saídas" description="Valores efetivamente pagos e recebidos por mês" />
        <div className="p-5">
          <CashFlowChart data={monthly} />
        </div>
      </Card>
    </div>
  );
}
