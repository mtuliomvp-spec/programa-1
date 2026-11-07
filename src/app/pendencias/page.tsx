import Link from "next/link";
import { requireModuleAny } from "@/lib/guards";
import { hasModuleAccess } from "@/lib/permissions";
import { getPendencias, type PendenciaGrupo } from "@/lib/pendencias";
import { formatCurrency } from "@/lib/format";
import { timed } from "@/lib/perf";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const corDoTom: Record<PendenciaGrupo["tom"], string> = {
  danger: "border-l-rose-500",
  warning: "border-l-amber-400",
  info: "border-l-sky-400",
};

/**
 * Pendências: tudo o que está esperando uma ação, de todas as telas, num lugar
 * só. Cada grupo leva à tela onde o assunto se resolve — e some daqui sozinho
 * quando é resolvido lá.
 */
export default async function PendenciasPage() {
  const user = await requireModuleAny(["estoque", "financeiro"]);
  const grupos = await timed("tela: pendências", () =>
    getPendencias({
      estoque: hasModuleAccess(user, "estoque"),
      financeiro: hasModuleAccess(user, "financeiro"),
    }),
  );
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <div>
      <PageHeader
        title="Pendências"
        description={
          total
            ? `${total} pendência(s) em ${grupos.length} assunto(s). Cada uma some sozinha quando é resolvida na tela de origem.`
            : "Tudo em dia."
        }
      />

      {grupos.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma pendência 🎉" description="Notas, recebimentos, documentação e contas estão em dia." />
        </Card>
      ) : (
        <>
          {/* Resumo: um atalho por assunto. */}
          <div className="mb-4 flex flex-wrap gap-2">
            {grupos.map((g) => (
              <a
                key={g.key}
                href={`#${g.key}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span>{g.icone}</span>
                {g.titulo}
                <Badge tone={g.tom}>{g.itens.length}</Badge>
              </a>
            ))}
          </div>

          <div className="space-y-4">
            {grupos.map((g) => {
              const soma = g.itens.reduce((s, i) => s + (i.valor ?? 0), 0);
              return (
                <Card key={g.key} id={g.key} className={`scroll-mt-4 border-l-4 ${corDoTom[g.tom]}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900">
                        {g.icone} {g.titulo} <span className="text-slate-400">({g.itens.length})</span>
                      </h2>
                      <p className="mt-0.5 text-sm text-slate-500">{g.comoResolver}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {soma > 0 ? (
                        <span className="text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(soma)}</span>
                      ) : null}
                      <Link href={g.href} className="text-sm font-medium text-blue-700 hover:underline">
                        Abrir →
                      </Link>
                    </div>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {g.itens.map((i) => (
                      <li key={i.id}>
                        <Link
                          href={i.href}
                          className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-medium text-slate-800">{i.titulo}</span>
                            {i.detalhe ? <span className="block text-xs text-slate-500">{i.detalhe}</span> : null}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            {i.valor ? (
                              <span className="text-sm font-semibold tabular-nums text-slate-800">
                                {formatCurrency(i.valor)}
                              </span>
                            ) : null}
                            {i.dias != null ? (
                              <span
                                className={`text-xs tabular-nums ${i.dias > 30 ? "font-medium text-rose-600" : "text-slate-400"}`}
                              >
                                {i.dias === 0 ? "hoje" : `há ${i.dias} dia(s)`}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
