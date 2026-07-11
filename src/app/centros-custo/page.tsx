import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureStructuralCostCenters } from "@/lib/structural";
import { formatCurrency } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import CostCenterForm from "./CostCenterForm";
import ToggleCostCenterButton from "./ToggleCostCenterButton";

export const dynamic = "force-dynamic";

const typeLabel = { ESTRUTURAL: "Estrutural", OBRA: "Obra", IMOVEL: "Imóvel", OUTRO: "Outro" } as const;

export default async function CentrosCustoPage() {
  // Garante os centros estruturais (Capital, Veículos, Administrativo) e
  // classifica lançamentos antigos que ainda estavam sem centro.
  await ensureStructuralCostCenters();
  const centers = await prisma.costCenter.findMany({
    include: {
      payables: { select: { amount: true, status: true } },
      receivables: { select: { amount: true, status: true } },
    },
    orderBy: [{ structural: "desc" }, { active: "desc" }, { name: "asc" }],
  });

  const withTotals = centers.map((c) => {
    const despesas = c.payables.reduce((s, p) => s + p.amount, 0);
    const receitas = c.receivables.reduce((s, r) => s + r.amount, 0);
    return { ...c, despesas, receitas, resultado: receitas - despesas };
  });

  return (
    <div>
      <PageHeader
        title="Centros de custo"
        description="Todo lançamento passa por um centro: os estruturais (Capital, Veículos, Administrativo) são automáticos; obras e imóveis você cria e escolhe nos lançamentos"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {withTotals.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum centro de custo"
                description="Cadastre ao lado (ex.: Obra galpão novo, Imóvel rua X). Depois, vincule contas a pagar/receber a ele nos lançamentos manuais."
              />
            </Card>
          ) : (
            withTotals.map((c) => (
              <Card key={c.id} className={`px-5 py-4 ${!c.active ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                      {c.name}
                      <Badge
                        tone={
                          c.structural
                            ? "info"
                            : c.type === "OBRA"
                              ? "warning"
                              : c.type === "IMOVEL"
                                ? "info"
                                : "default"
                        }
                      >
                        {typeLabel[c.type]}
                      </Badge>
                      {!c.active ? <Badge>Encerrado</Badge> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Despesas {formatCurrency(c.despesas)} · Receitas {formatCurrency(c.receitas)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Resultado</p>
                      <p
                        className={`text-lg font-bold ${c.resultado >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {formatCurrency(c.resultado)}
                      </p>
                    </div>
                    {!c.structural ? <ToggleCostCenterButton id={c.id} active={c.active} /> : null}
                  </div>
                </div>
              </Card>
            ))
          )}
          <Card className="border-blue-200 bg-blue-50/60 px-5 py-3">
            <p className="text-sm text-slate-600">
              💡 Para lançar uma despesa ou receita num centro de custo, use{" "}
              <Link href="/financeiro/a-pagar/novo" className="font-medium text-blue-700 hover:underline">
                Contas a pagar → Nova conta
              </Link>{" "}
              ou{" "}
              <Link href="/financeiro/a-receber/novo" className="font-medium text-blue-700 hover:underline">
                Contas a receber → Nova conta
              </Link>{" "}
              e escolha o centro no campo próprio.
            </p>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Novo centro de custo" />
          <div className="p-5">
            <CostCenterForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
