import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Imóveis da loja e dos sócios: documentos e contas de cada um. */
export default async function ImoveisPage() {
  await requireModule("imoveis");
  const [imoveis, podeCriar] = await Promise.all([
    prisma.imovel.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: {
        capitalBeneficiary: { select: { name: true } },
        _count: { select: { anexos: { where: { completo: true } }, recorrencias: true } },
        payables: { where: { status: { not: "PAGO" } }, select: { amount: true } },
      },
    }),
    userCan("imoveis", "criar"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Imóveis"
        description="Documentos de cada imóvel (registro, planta, ITR) e as contas dele (ITR anual, honorários, IPTU)"
        action={podeCriar ? <LinkButton href="/imoveis/novo">+ Novo imóvel</LinkButton> : undefined}
      />
      {imoveis.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum imóvel cadastrado"
            description="Cadastre o imóvel e anexe os documentos dele; as contas (ITR, honorários) ficam ligadas a ele."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {imoveis.map((i) => {
            const emAberto = i.payables.reduce((s, p) => s + p.amount, 0);
            return (
              <Link
                key={i.id}
                href={`/imoveis/${i.id}`}
                className={`block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300 ${i.ativo ? "" : "opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">🏡 {i.nome}</p>
                  <Badge tone={i.tipo === "RURAL" ? "success" : "info"}>{i.tipo === "RURAL" ? "Rural" : "Urbano"}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {[i.municipio && `${i.municipio}${i.uf ? `/${i.uf}` : ""}`, i.area, i.cib && `CIB ${i.cib}`]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {i.proprietario || i.capitalBeneficiary ? (
                  <p className="text-xs text-slate-500">Em nome de {i.proprietario || i.capitalBeneficiary?.name}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-600">
                  📎 {i._count.anexos} documento(s) · 🔁 {i._count.recorrencias} conta(s) recorrente(s)
                  {emAberto > 0 ? <span className="text-amber-700"> · {formatCurrency(emAberto)} em aberto</span> : null}
                  {!i.ativo ? " · inativo" : ""}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
