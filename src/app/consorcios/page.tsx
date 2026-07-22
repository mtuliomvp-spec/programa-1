import { prisma } from "@/lib/prisma";
import { ensureConsortiumInstallments } from "@/lib/recurring";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import ConsortiumForm from "./ConsortiumForm";
import ConsortiumActions from "./ConsortiumActions";

export const dynamic = "force-dynamic";

const statusMeta = {
  ATIVO: { label: "Ativo", tone: "info" },
  CONTEMPLADO: { label: "Contemplado 🎉", tone: "success" },
  ENCERRADO: { label: "Encerrado", tone: "default" },
} as const;

export default async function ConsorciosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string }>;
}) {
  await ensureConsortiumInstallments();
  const { q: qParam, min, max } = await searchParams;
  const q = (qParam || "").trim();

  const consortiums = await prisma.consortium.findMany({
    include: { payables: { select: { amount: true, status: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const withTotals = consortiums
    .map((c) => {
      const paid = c.payables.filter((p) => p.status === "PAGO");
      return {
        ...c,
        paidCount: paid.length,
        paidTotal: paid.reduce((s, p) => s + p.amount, 0),
      };
    })
    .filter(
      (c) =>
        matchesSearch(
          q,
          c.name,
          c.administrator,
          c.creditValue,
          formatCurrency(c.creditValue),
          c.installmentValue,
          formatCurrency(c.installmentValue),
          statusMeta[c.status].label,
        ) && inValueRange(c.creditValue, min, max),
    );

  const active = withTotals.filter((c) => c.status !== "ENCERRADO");
  const monthlyCommitment = withTotals
    .filter((c) => c.status === "ATIVO")
    .reduce((s, c) => s + c.installmentValue, 0);

  return (
    <div>
      <PageHeader
        title="Consórcios"
        description="Cartas de crédito com parcelas lançadas automaticamente no financeiro"
      />

      <ReportToolbar
        basePath="/consorcios"
        printTitle="Consórcios"
        q={q}
        placeholder="Buscar (nome, administradora, valor...)"
        value
        min={min}
        max={max}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Consórcios em andamento" value={String(active.length)} />
        <StatCard label="Parcelas por mês" value={formatCurrency(monthlyCommitment)} />
        <StatCard
          label="Total já pago"
          value={formatCurrency(withTotals.reduce((s, c) => s + c.paidTotal, 0))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {withTotals.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum consórcio cadastrado"
                description="Cadastre ao lado — as parcelas do mês entram sozinhas em contas a pagar."
              />
            </Card>
          ) : (
            withTotals.map((c) => {
              const pct = Math.min(100, (c.paidCount / c.installmentsCount) * 100);
              return (
                <Card key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.administrator ? `${c.administrator} · ` : ""}
                        Carta de {formatCurrency(c.creditValue)} · {formatCurrency(c.installmentValue)}/mês
                        (dia {c.dueDay}) · início {formatDate(c.startDate)}
                        {c.contemplatedAt ? ` · contemplado em ${formatDate(c.contemplatedAt)}` : ""}
                      </p>
                    </div>
                    <Badge tone={statusMeta[c.status].tone}>{statusMeta[c.status].label}</Badge>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
                      <span>
                        {c.paidCount} de {c.installmentsCount} parcelas pagas
                      </span>
                      <span className="tabular-nums">{formatCurrency(c.paidTotal)} pagos</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, pct)}%`, background: "#2a78d6" }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <ConsortiumActions id={c.id} status={c.status} />
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <Card className="h-fit print:hidden">
          <CardHeader title="Novo consórcio" />
          <div className="p-5">
            <ConsortiumForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
