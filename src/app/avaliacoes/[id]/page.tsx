import { notFound } from "next/navigation";
import { requireModule, userCan } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, LinkButton, PageHeader, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  CHECKLIST_ITEMS,
  STATE_LABEL,
  STATE_TONE,
  parseChecklist,
  parseOptionals,
  diffChecklist,
} from "@/lib/appraisals";
import AppraisalPhotos from "./AppraisalPhotos";
import DeliveryConference from "./DeliveryConference";
import DeleteAppraisalButton from "./DeleteAppraisalButton";

export const dynamic = "force-dynamic";

export default async function AvaliacaoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("avaliacoes");
  const { id } = await params;

  const a = await prisma.vehicleAppraisal.findUnique({
    where: { id },
    include: { photos: { orderBy: { createdAt: "asc" } } },
  });
  if (!a) notFound();

  const [canEdit, canDelete, canConfer] = await Promise.all([
    userCan("avaliacoes", "editar"),
    userCan("avaliacoes", "excluir"),
    userCan("avaliacoes", "conferir"),
  ]);

  const title = [a.brand, a.model, a.version].filter(Boolean).join(" ") || "Veículo";
  const checklist = parseChecklist(a.checklist);
  const optionals = parseOptionals(a.optionals);
  const isConferido = a.status === "CONFERIDO";
  const delivery = isConferido ? parseChecklist(a.deliveryChecklist) : null;
  const diffs = delivery ? diffChecklist(checklist, delivery) : [];
  const diffKeys = new Set(diffs.map((d) => d.key));

  const specs: [string, string | null][] = [
    ["Placa", a.plate],
    ["Ano fab./modelo", [a.manufactureYear, a.modelYear].filter(Boolean).join("/") || null],
    ["KM", a.km != null ? a.km.toLocaleString("pt-BR") : null],
    ["Cor", a.color],
    ["Combustível", a.fuel],
    ["Câmbio", a.transmission],
    ["Chassi", a.chassi],
    ["RENAVAM", a.renavam],
    ["FIPE", a.fipePrice != null ? formatCurrency(a.fipePrice) : null],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={title}
        description={a.plate ? `Placa ${a.plate}` : "Avaliação de veículo"}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/avaliacoes" variant="secondary">
              ← Voltar
            </LinkButton>
            {canEdit ? <LinkButton href={`/avaliacoes/${a.id}/editar`}>✏️ Editar</LinkButton> : null}
            {canDelete ? <DeleteAppraisalButton id={a.id} /> : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        {isConferido ? (
          diffs.length === 0 ? (
            <Badge tone="success">✓ Conferido na entrega · sem divergências</Badge>
          ) : (
            <Badge tone="danger">
              ⚠ Conferido na entrega · {diffs.length} divergência{diffs.length > 1 ? "s" : ""}
            </Badge>
          )
        ) : (
          <Badge tone="info">Avaliado</Badge>
        )}
        {a.appraisalPrice != null ? (
          <span className="text-lg font-semibold text-slate-900">
            Avaliação: {formatCurrency(a.appraisalPrice)}
          </span>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Fotos" />
        <AppraisalPhotos
          appraisalId={a.id}
          photos={a.photos.map((p) => ({ id: p.id, filename: p.filename }))}
          canManage={canEdit}
        />
      </Card>

      <Card>
        <CardHeader title="Dados do veículo" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 sm:grid-cols-3">
          {specs.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm font-medium text-slate-800">{value || "—"}</p>
            </div>
          ))}
        </div>
        {(a.ownerName || a.ownerPhone) && (
          <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Proprietário/ofertante:</span>{" "}
            {a.ownerName || "—"}
            {a.ownerPhone ? ` · ${a.ownerPhone}` : ""}
          </div>
        )}
        {a.notes ? (
          <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Observações:</span> {a.notes}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Opcionais" />
        <div className="p-5">
          {optionals.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum opcional informado.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {optionals.map((o) => (
                <Badge key={o}>{o}</Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Checklist"
          description={isConferido ? "Avaliação × entrega — divergências destacadas." : undefined}
        />
        <div className="p-5">
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map((item) => {
              const av = checklist[item.key];
              const de = delivery?.[item.key];
              const changed = diffKeys.has(item.key);
              return (
                <div
                  key={item.key}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                    changed ? "border-rose-200 bg-rose-50" : "border-slate-100"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[av.state]}`}>
                      {isConferido ? "Aval: " : ""}
                      {STATE_LABEL[av.state]}
                    </span>
                    {isConferido && de ? (
                      <>
                        <span className="text-slate-400">→</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[de.state]}`}>
                          Entrega: {STATE_LABEL[de.state]}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {av.obs || (isConferido && de?.obs) ? (
                    <p className="w-full text-xs text-slate-500">
                      {av.obs ? `Avaliação: ${av.obs}` : ""}
                      {av.obs && de?.obs ? " · " : ""}
                      {isConferido && de?.obs ? `Entrega: ${de.obs}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Conferência de entrega"
          description={
            isConferido
              ? `Conferido em ${formatDate(a.deliveredAt!)}${a.checkedBy ? ` por ${a.checkedBy}` : ""}.`
              : "Registre a conferência quando o veículo for entregue na loja."
          }
        />
        {isConferido && diffs.length > 0 ? (
          <div className="border-b border-slate-100 px-5 py-3">
            <p className="text-sm font-semibold text-rose-700">Divergências em relação à avaliação:</p>
            <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
              {diffs.map((d) => (
                <li key={d.key}>
                  {d.label}: {STATE_LABEL[d.from]} → {STATE_LABEL[d.to]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {isConferido && a.deliveryNotes ? (
          <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Observações da conferência:</span>{" "}
            {a.deliveryNotes}
          </div>
        ) : null}
        {canConfer ? (
          <DeliveryConference
            appraisalId={a.id}
            appraisalChecklist={checklist}
            existingDelivery={delivery}
            existingCheckedBy={a.checkedBy ?? ""}
            existingNotes={a.deliveryNotes ?? ""}
            alreadyDone={isConferido}
          />
        ) : (
          <div className="p-5 text-sm text-slate-500">
            {isConferido
              ? "Conferência já registrada."
              : "Você não tem permissão para registrar a conferência de entrega."}
          </div>
        )}
      </Card>
    </div>
  );
}
