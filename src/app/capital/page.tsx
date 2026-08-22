import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureCompanyBeneficiary } from "@/lib/company";
import { formatCurrency } from "@/lib/format";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan } from "@/lib/guards";
import NewBeneficiaryForm from "./NewBeneficiaryForm";
import ContabilizarButton from "./ContabilizarButton";

export const dynamic = "force-dynamic";

export default async function CapitalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string }>;
}) {
  const { q: qParam, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const canManage = await userCan("administrativo", "capital");
  // A empresa dos Parâmetros sempre aparece como beneficiária própria
  await ensureCompanyBeneficiary();
  const [beneficiaries, allocationsByBenef] = await Promise.all([
    prisma.capitalBeneficiary.findMany({
      include: { transactions: true },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
    }),
    prisma.investmentAllocation.groupBy({ by: ["beneficiaryId"], _sum: { amount: true } }),
  ]);
  const appliedByBenef = new Map(
    allocationsByBenef.map((a) => [a.beneficiaryId, Math.round((a._sum.amount ?? 0) * 100) / 100]),
  );

  const mapped = beneficiaries.map((b) => {
    const sum = (kind: string) =>
      b.transactions.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
    const aportes = sum("APORTE");
    const retiradas = sum("RETIRADA");
    const proLabore = sum("PRO_LABORE");
    const saldo = aportes - retiradas;
    const aplicado = appliedByBenef.get(b.id) ?? 0;
    return { ...b, aportes, retiradas, proLabore, saldo, aplicado, livre: saldo - aplicado };
  });

  const filtered = mapped.filter(
    (b) => matchesSearch(q, b.name, b.saldo, formatCurrency(b.saldo)) && inValueRange(b.saldo, min, max),
  );

  // Totais somam TODOS (inclusive os vinculados/caução) — não podem divergir dos
  // checks de saldo nem da equação patrimonial; o agrupamento é só visual.
  const totalInvestido = filtered.reduce((s, b) => s + b.saldo, 0);
  const totalAportes = filtered.reduce((s, b) => s + b.aportes, 0);
  const totalRetiradas = filtered.reduce((s, b) => s + b.retiradas, 0);

  // Caução por responsável: soma dos saldos dos vinculados (de todos, não só os
  // filtrados), para exibir no card do responsável.
  const caucaoByParent = new Map<string, { count: number; total: number }>();
  for (const b of mapped) {
    if (b.parentId) {
      const cur = caucaoByParent.get(b.parentId) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += b.saldo;
      caucaoByParent.set(b.parentId, cur);
    }
  }

  // A LISTA de cards esconde os vinculados (aparecem sob o responsável).
  const cards = filtered.filter((b) => b.parentId == null);

  return (
    <div>
      <PageHeader
        title="Capital dos sócios"
        description="Aportes, retiradas e pró-labore individualizados por beneficiário"
      />

      <ReportToolbar
        basePath="/capital"
        printTitle="Capital dos sócios"
        q={q}
        placeholder="Buscar por beneficiário..."
        value
        min={min}
        max={max}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Capital investido" value={formatCurrency(totalInvestido)} hint="aportes menos retiradas" />
        <StatCard label="Total de aportes" value={formatCurrency(totalAportes)} tone="positive" />
        <StatCard label="Total de retiradas" value={formatCurrency(totalRetiradas)} tone="negative" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {cards.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum sócio cadastrado"
                description="Cadastre os beneficiários ao lado para acompanhar o capital de cada um."
              />
            </Card>
          ) : (
            cards.map((b) => (
              <Link key={b.id} href={`/capital/${b.id}`} className="block">
                <Card className="px-5 py-4 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-slate-900">
                        {b.name}
                        {b.isCompany ? <Badge tone="info">Empresa</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Aportes {formatCurrency(b.aportes)} · Retiradas {formatCurrency(b.retiradas)}
                        {b.proLabore > 0 ? ` · Pró-labore pago ${formatCurrency(b.proLabore)}` : ""}
                      </p>
                      {b.aplicado > 0 ? (
                        <p className="mt-0.5 text-xs font-medium text-emerald-700">
                          📈 Aplicado {formatCurrency(b.aplicado)} ·{" "}
                          <span className={b.livre < 0 ? "text-rose-600" : ""}>
                            Livre {formatCurrency(b.livre)}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Saldo investido</p>
                      <p
                        className={`text-lg font-bold ${b.saldo >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {formatCurrency(b.saldo)}
                      </p>
                      {canManage && Math.abs(b.saldo) >= 0.01 ? (
                        <ContabilizarButton beneficiaryId={b.id} name={b.name} saldo={b.saldo} />
                      ) : null}
                    </div>
                  </div>
                  {caucaoByParent.has(b.id) ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          🏠 Caução de terceiros · {caucaoByParent.get(b.id)!.count} vinculado(s)
                        </p>
                        <p className="text-[11px] text-amber-700/80">
                          Guardada em nome de terceiros — <strong>não entra</strong> no saldo investido dele.
                        </p>
                      </div>
                      <p className="text-base font-bold text-amber-700">
                        {formatCurrency(caucaoByParent.get(b.id)!.total)}
                      </p>
                    </div>
                  ) : null}
                </Card>
              </Link>
            ))
          )}
        </div>

        {canManage ? (
          <Card className="h-fit print:hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Novo beneficiário</h2>
            </div>
            <div className="p-5">
              <NewBeneficiaryForm />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
