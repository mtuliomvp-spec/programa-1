import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import NewBeneficiaryForm from "./NewBeneficiaryForm";

export const dynamic = "force-dynamic";

export default async function CapitalPage() {
  const beneficiaries = await prisma.capitalBeneficiary.findMany({
    include: { transactions: true },
    orderBy: { name: "asc" },
  });

  const withTotals = beneficiaries.map((b) => {
    const sum = (kind: string) =>
      b.transactions.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
    const aportes = sum("APORTE");
    const retiradas = sum("RETIRADA");
    const proLabore = sum("PRO_LABORE");
    return { ...b, aportes, retiradas, proLabore, saldo: aportes - retiradas };
  });

  const totalInvestido = withTotals.reduce((s, b) => s + b.saldo, 0);
  const totalAportes = withTotals.reduce((s, b) => s + b.aportes, 0);
  const totalRetiradas = withTotals.reduce((s, b) => s + b.retiradas, 0);

  return (
    <div>
      <PageHeader
        title="Capital dos sócios"
        description="Aportes, retiradas e pró-labore individualizados por beneficiário"
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Capital investido" value={formatCurrency(totalInvestido)} hint="aportes menos retiradas" />
        <StatCard label="Total de aportes" value={formatCurrency(totalAportes)} tone="positive" />
        <StatCard label="Total de retiradas" value={formatCurrency(totalRetiradas)} tone="negative" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {withTotals.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum sócio cadastrado"
                description="Cadastre os beneficiários ao lado para acompanhar o capital de cada um."
              />
            </Card>
          ) : (
            withTotals.map((b) => (
              <Link key={b.id} href={`/capital/${b.id}`} className="block">
                <Card className="px-5 py-4 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{b.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Aportes {formatCurrency(b.aportes)} · Retiradas {formatCurrency(b.retiradas)}
                        {b.proLabore > 0 ? ` · Pró-labore pago ${formatCurrency(b.proLabore)}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Saldo investido</p>
                      <p
                        className={`text-lg font-bold ${b.saldo >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {formatCurrency(b.saldo)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>

        <Card className="h-fit">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Novo beneficiário</h2>
          </div>
          <div className="p-5">
            <NewBeneficiaryForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
