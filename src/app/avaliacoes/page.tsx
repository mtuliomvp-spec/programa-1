import Link from "next/link";
import { requireModule } from "@/lib/guards";
import { userCan } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, LinkButton, PageHeader, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseChecklist, diffChecklist } from "@/lib/appraisals";

export const dynamic = "force-dynamic";

export default async function AvaliacoesPage() {
  await requireModule("avaliacoes");
  const canCreate = await userCan("avaliacoes", "criar");

  const appraisals = await prisma.vehicleAppraisal.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      photos: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });

  return (
    <div>
      <PageHeader
        title="Veículos avaliados"
        description="Avaliações de veículos — fotos, dados FIPE, opcionais, checklist e conferência na entrega."
        action={
          canCreate ? (
            <LinkButton href="/avaliacoes/nova">➕ Nova avaliação</LinkButton>
          ) : undefined
        }
      />

      {appraisals.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma avaliação ainda"
            description="Crie a primeira avaliação de veículo."
            action={canCreate ? <LinkButton href="/avaliacoes/nova">➕ Nova avaliação</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {appraisals.map((a) => {
            const title = [a.brand, a.model, a.version].filter(Boolean).join(" ") || "Veículo";
            const thumb = a.photos[0]?.id;
            let deliveryTone: "success" | "danger" | null = null;
            let deliveryText = "";
            if (a.status === "CONFERIDO") {
              const diffs = diffChecklist(parseChecklist(a.checklist), parseChecklist(a.deliveryChecklist));
              if (diffs.length === 0) {
                deliveryTone = "success";
                deliveryText = "Conferido · sem divergências";
              } else {
                deliveryTone = "danger";
                deliveryText = `Conferido · ${diffs.length} divergência${diffs.length > 1 ? "s" : ""}`;
              }
            }
            return (
              <Link
                key={a.id}
                href={`/avaliacoes/${a.id}`}
                className="block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-video w-full bg-slate-100">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/avaliacoes/foto/${thumb}`}
                      alt={title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl text-slate-300">🚗</div>
                  )}
                </div>
                <div className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{title}</p>
                    {a.status === "AVALIADO" ? (
                      <Badge tone="info">Avaliado</Badge>
                    ) : (
                      <Badge tone={deliveryTone ?? "default"}>{deliveryText}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {a.plate ? `${a.plate} · ` : ""}
                    {a.modelYear ? `${a.modelYear}` : ""}
                    {a.km ? ` · ${a.km.toLocaleString("pt-BR")} km` : ""}
                  </p>
                  {a.appraisalPrice ? (
                    <p className="text-sm font-semibold text-slate-800">
                      Avaliação: {formatCurrency(a.appraisalPrice)}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    {formatDate(a.createdAt)}
                    {a.createdByName ? ` · ${a.createdByName}` : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
