import Link from "next/link";
import { getDashboardStats, getUpcomingDue, getCashFlowLastMonths } from "@/lib/queries";
import { getStructuralSummary } from "@/lib/structural";
import { getPatrimonialStats } from "@/lib/patrimonial";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import CashFlowChart from "@/components/CashFlowChart";
import PatrimonialCard from "@/components/PatrimonialCard";

export const dynamic = "force-dynamic";

const structuralIcon: Record<string, string> = {
  CAPITAL: "💼",
  VEICULOS: "🚗",
  ADMINISTRATIVO: "🏢",
};

export default async function DashboardPage() {
  const [stats, upcoming, monthly, structural, pat] = await Promise.all([
    getDashboardStats(),
    getUpcomingDue(7),
    getCashFlowLastMonths(6),
    getStructuralSummary(),
    getPatrimonialStats(),
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

      {/* Posição patrimonial — estilo Agrasty, com a equação patrimonial */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PatrimonialCard
          label="Saldo em caixa"
          value={pat.saldoCaixa}
          tone="green"
          icon="🏦"
          sub="Soma das contas financeiras (caixas e bancos)"
          href="/financeiro/contas"
        />
        <PatrimonialCard
          label="Estoque de veículos"
          value={pat.estoqueVeiculosPago}
          tone="green"
          icon="🚗"
          sub="Só o que já foi pago dos carros em estoque"
          subItems={[
            { label: "Negociado a pagar", value: pat.veiculosNegociadoPendente },
            { label: "Recebido em vendas", value: pat.veiculosRecebido },
          ]}
          href="/estoque"
        />
        <PatrimonialCard
          label="Almoxarifado (peças)"
          value={pat.almoxarifado}
          tone="blue"
          icon="📦"
          sub="Valor das peças em estoque (quantidade × custo)"
          href="/pecas"
        />
        <PatrimonialCard
          label="Saldo de capital"
          value={pat.saldoCapital}
          tone={pat.saldoCapital >= 0 ? "green" : "red"}
          icon="💲"
          sub="Aportes menos retiradas dos sócios"
          href="/capital"
        />
        <PatrimonialCard
          label="Investimentos (consórcios)"
          value={pat.consorcios}
          tone="violet"
          icon="🐷"
          sub="Aplicado em cotas de consórcio (parcelas pagas)"
          href="/consorcios"
        />
        <PatrimonialCard
          label={pat.lucro >= 0 ? "Lucro (patrimonial)" : "Prejuízo (patrimonial)"}
          value={pat.lucro}
          tone={pat.lucro >= 0 ? "green" : "red"}
          icon={pat.lucro >= 0 ? "📈" : "📉"}
          formula="Caixa + Estoque de veículos (pago) + Almoxarifado + Consórcios − Capital"
        />
      </div>

      {/* Indicadores operacionais e contas (fora da equação patrimonial) */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Contas a receber"
          value={formatCurrency(pat.contasAReceber)}
          hint="títulos pendentes a receber"
        />
        <StatCard
          label="Contas a pagar"
          value={formatCurrency(pat.contasAPagar)}
          tone={pat.titulosVencidosCount > 0 ? "negative" : "default"}
          hint={
            pat.titulosVencidosCount > 0
              ? `${pat.titulosVencidosCount} vencido(s) · ${formatCurrency(pat.titulosVencidosValor)}`
              : "títulos pendentes a pagar"
          }
        />
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
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Fluxos estruturais"
            description="Resultado de cada centro: Capital, Veículos e Administrativo"
            action={
              <Link href="/centros-custo" className="text-sm font-medium text-slate-900 hover:underline">
                Ver centros →
              </Link>
            }
          />
          <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {structural.map((s) => (
              <Link
                key={s.key}
                href="/centros-custo"
                className="px-5 py-4 transition-colors hover:bg-slate-50"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span aria-hidden>{structuralIcon[s.key]}</span>
                  {s.name}
                </p>
                {s.key === "VEICULOS" ? (
                  <>
                    <p className="mt-1 text-xl font-bold text-emerald-600">
                      {formatCurrency(s.imobilizado)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Em estoque (pago) {formatCurrency(s.imobilizado)}
                      {s.negociadoPendente > 0 ? ` · a pagar ${formatCurrency(s.negociadoPendente)}` : ""}
                      {" · "}Receitas {formatCurrency(s.receitas)} · Despesas {formatCurrency(s.despesas)}
                    </p>
                  </>
                ) : (
                  <>
                    <p
                      className={`mt-1 text-xl font-bold ${s.resultado >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {formatCurrency(s.resultado)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Receitas {formatCurrency(s.receitas)} · Despesas {formatCurrency(s.despesas)}
                    </p>
                  </>
                )}
              </Link>
            ))}
          </div>
        </Card>
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
