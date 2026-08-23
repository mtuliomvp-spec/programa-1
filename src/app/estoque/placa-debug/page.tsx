import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { lookupPlateRaw } from "@/lib/plate-lookup";
import { Card, CardHeader, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Página de diagnóstico da consulta por placa (somente ADMIN).
 * Mostra a resposta completa do provedor para investigar campos
 * que não foram preenchidos no formulário de veículo.
 */
export default async function PlacaDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ placa?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/");

  const { placa } = await searchParams;
  const result = placa ? await lookupPlateRaw(placa) : null;

  const fipe =
    result?.ok && result.json.fipe !== undefined
      ? JSON.stringify(result.json.fipe, null, 2)
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Diagnóstico da consulta por placa"
        description="Mostra o que o provedor devolve para uma placa (somente administradores)"
      />

      <Card>
        <div className="p-5">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input
              name="placa"
              defaultValue={placa || ""}
              placeholder="ABC1D23"
              className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Consultar
            </button>
          </form>
        </div>
      </Card>

      {result && !result.ok ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {result.error}
        </p>
      ) : null}

      {result?.ok ? (
        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader title="Dados que o sistema aproveitou" />
            <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-slate-700">
              {JSON.stringify(result.normalized, null, 2)}
            </pre>
          </Card>

          <Card>
            <CardHeader
              title="Seção FIPE da resposta"
              description="Versões e valores exatamente como o provedor devolve"
            />
            <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-slate-700">
              {fipe ?? "(a resposta não tem a seção 'fipe')"}
            </pre>
          </Card>

          <Card>
            <CardHeader
              title="Campos no topo da resposta"
              description="Nomes e valores resumidos (textos longos são cortados)"
            />
            <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-slate-700">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(result.json).map(([key, value]) => [
                    key,
                    typeof value === "object" && value !== null
                      ? `(${Array.isArray(value) ? "lista" : "objeto"} com ${Object.keys(value).length} itens)`
                      : String(value).slice(0, 80),
                  ]),
                ),
                null,
                2,
              )}
            </pre>
          </Card>

          {result.json.extra && typeof result.json.extra === "object" ? (
            <Card>
              <CardHeader title="Campos da seção 'extra'" />
              <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-slate-700">
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(result.json.extra as Record<string, unknown>).map(
                      ([key, value]) => [
                        key,
                        typeof value === "object" && value !== null
                          ? `(${Array.isArray(value) ? "lista" : "objeto"} com ${Object.keys(value).length} itens)`
                          : String(value).slice(0, 80),
                      ],
                    ),
                  ),
                  null,
                  2,
                )}
              </pre>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
