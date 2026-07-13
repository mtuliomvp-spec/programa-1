import Link from "next/link";
import { getMonthlyDre, getStockAging, getPerformanceStats } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { Card, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    href: "/relatorios/lucro-prejuizo",
    icon: "📈",
    title: "Lucro / Prejuízo",
    description: "O resultado da loja no período, com o lucro ou prejuízo em destaque",
  },
  {
    href: "/relatorios/dre",
    icon: "📑",
    title: "DRE mensal",
    description: "Receitas, custos, despesas e lucro líquido mês a mês",
  },
  {
    href: "/relatorios/lucro-veiculos",
    icon: "🚗",
    title: "Lucro por veículo",
    description: "Quanto cada veículo vendido deu de lucro real, com custos e dias em estoque",
  },
  {
    href: "/relatorios/aging",
    icon: "⏳",
    title: "Tempo de estoque (aging)",
    description: "Há quanto tempo cada veículo está parado e quanto capital está imobilizado",
  },
  {
    href: "/relatorios/despesas",
    icon: "💸",
    title: "Despesas por categoria",
    description: "Para onde o dinheiro da loja está indo: compras, operação, comissões",
  },
  {
    href: "/financeiro/fluxo-caixa",
    icon: "💰",
    title: "Fluxo de caixa",
    description: "Entradas e saídas realizadas, mês a mês",
  },
];

export default async function RelatoriosPage() {
  const [dre, aging, perf] = await Promise.all([
    getMonthlyDre(1),
    getStockAging(),
    getPerformanceStats(),
  ]);
  const thisMonth = dre[dre.length - 1];
  const stuck = aging.buckets.find((b) => b.minDays === 91);

  return (
    <div>
      <PageHeader
        title="Central de relatórios"
        description="Todos os números da MVP Veículos para decidir com segurança"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Lucro líquido do mês"
          value={formatCurrency(thisMonth?.lucroLiquido ?? 0)}
          tone={(thisMonth?.lucroLiquido ?? 0) >= 0 ? "positive" : "negative"}
          hint={`${thisMonth?.veiculosVendidos ?? 0} veículo(s) vendido(s)`}
        />
        <StatCard
          label="Capital imobilizado"
          value={formatCurrency(perf.investedInStock)}
          hint="compra + custos dos veículos em estoque"
        />
        <StatCard
          label="Tempo médio em estoque"
          value={`${perf.avgDaysInStock} dias`}
          tone={perf.avgDaysInStock > 60 ? "warning" : "default"}
        />
        <StatCard
          label="Parados há mais de 90 dias"
          value={String(stuck?.count ?? 0)}
          tone={(stuck?.count ?? 0) > 0 ? "negative" : "positive"}
          hint={stuck && stuck.count > 0 ? `${formatCurrency(stuck.invested)} imobilizados` : "estoque saudável"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group">
            <Card className="h-full px-5 py-5 transition-shadow group-hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                  {r.icon}
                </span>
                <div>
                  <p className="font-semibold text-slate-900 group-hover:text-blue-700">{r.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{r.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
