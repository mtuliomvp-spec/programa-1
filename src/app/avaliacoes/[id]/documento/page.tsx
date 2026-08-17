import { notFound } from "next/navigation";
import { requireModule } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";
import {
  CHECKLIST_ITEMS,
  STATE_LABEL,
  parseChecklist,
  parseOptionals,
  diffChecklist,
} from "@/lib/appraisals";

export const dynamic = "force-dynamic";

export default async function AvaliacaoDocumentoPage({
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

  const company = await getCompany();
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
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/avaliacoes/${a.id}`}>
          ← Voltar
        </LinkButton>
        <PrintButton title={`Avaliação ${title}`} subtitle="" />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">FICHA DE AVALIAÇÃO</p>
              <p className="text-slate-500">{formatDate(a.createdAt)}</p>
              {a.createdByName ? <p className="text-slate-500">{a.createdByName}</p> : null}
            </>
          }
        />

        <h2 className="text-xl font-bold">{title}</h2>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {a.appraisalPrice != null ? (
            <p>
              <span className="text-slate-500">Preço da avaliação:</span>{" "}
              <span className="font-semibold">{formatCurrency(a.appraisalPrice)}</span>
            </p>
          ) : null}
          {a.ownerAskingPrice != null ? (
            <p>
              <span className="text-slate-500">Pedido do proprietário:</span>{" "}
              <span className="font-semibold">{formatCurrency(a.ownerAskingPrice)}</span>
            </p>
          ) : null}
        </div>

        {/* Dados do veículo */}
        <section className="mt-6">
          <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
            Dados do veículo
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {specs.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-sm font-medium">{value || "—"}</p>
              </div>
            ))}
          </div>
          {(a.ownerName || a.ownerPhone) && (
            <p className="mt-3 text-sm">
              <span className="text-slate-500">Proprietário/ofertante:</span> {a.ownerName || "—"}
              {a.ownerPhone ? ` · ${a.ownerPhone}` : ""}
            </p>
          )}
        </section>

        {/* Opcionais */}
        <section className="mt-6">
          <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
            Opcionais
          </h3>
          {optionals.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum opcional informado.</p>
          ) : (
            <p className="text-sm">{optionals.join(" · ")}</p>
          )}
        </section>

        {/* Checklist */}
        <section className="mt-6">
          <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
            Checklist{isConferido ? " (avaliação × entrega)" : ""}
          </h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="py-1">Item</th>
                <th className="py-1">Avaliação</th>
                {isConferido ? <th className="py-1">Entrega</th> : null}
                <th className="py-1">Observação</th>
              </tr>
            </thead>
            <tbody>
              {CHECKLIST_ITEMS.map((item) => {
                const av = checklist[item.key];
                const de = delivery?.[item.key];
                const changed = diffKeys.has(item.key);
                return (
                  <tr key={item.key} className={changed ? "bg-rose-50" : ""}>
                    <td className="border-t border-slate-100 py-1 pr-2 font-medium">{item.label}</td>
                    <td className="border-t border-slate-100 py-1 pr-2">{STATE_LABEL[av.state]}</td>
                    {isConferido ? (
                      <td className="border-t border-slate-100 py-1 pr-2">
                        {de ? STATE_LABEL[de.state] : "—"}
                      </td>
                    ) : null}
                    <td className="border-t border-slate-100 py-1 text-xs text-slate-500">
                      {[av.obs, isConferido && de?.obs ? `Entrega: ${de.obs}` : ""]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Conferência de entrega */}
        {isConferido ? (
          <section className="mt-6">
            <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
              Conferência de entrega
            </h3>
            <p className="text-sm">
              Conferido em {formatDate(a.deliveredAt!)}
              {a.checkedBy ? ` por ${a.checkedBy}` : ""}.{" "}
              {diffs.length === 0
                ? "Sem divergências em relação à avaliação."
                : `${diffs.length} divergência(s).`}
            </p>
            {diffs.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                {diffs.map((d) => (
                  <li key={d.key}>
                    {d.label}: {STATE_LABEL[d.from]} → {STATE_LABEL[d.to]}
                  </li>
                ))}
              </ul>
            ) : null}
            {a.deliveryNotes ? (
              <p className="mt-2 text-sm">
                <span className="text-slate-500">Observações:</span> {a.deliveryNotes}
              </p>
            ) : null}
          </section>
        ) : null}

        {a.notes ? (
          <section className="mt-6">
            <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
              Observações
            </h3>
            <p className="whitespace-pre-wrap text-sm">{a.notes}</p>
          </section>
        ) : null}

        {/* Fotos */}
        {a.photos.length > 0 ? (
          <section className="mt-6">
            <h3 className="mb-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
              Fotos
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {a.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={`/avaliacoes/foto/${p.id}`}
                  alt={title}
                  className="aspect-video w-full rounded border border-slate-200 object-cover"
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
