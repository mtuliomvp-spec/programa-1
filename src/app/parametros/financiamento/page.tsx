import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { listFinancingRates } from "@/lib/financing-rates";
import { formatDate } from "@/lib/format";
import { SIMULATOR_DISCLAIMER } from "@/lib/financing";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { syncBcbRatesThrottled } from "@/lib/bcb-rates";
import { BcbSyncCard, RateForm, RateRowActions, SimulatorToggle, type RateRow } from "./RateForms";

export const dynamic = "force-dynamic";

export default async function FinanciamentoVitrinePage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");

  // Mantém a referência do BC fresca sem cron: uma busca por dia, no máximo,
  // quando alguém abre esta tela. Nunca lança.
  await syncBcbRatesThrottled();
  const [rates, company] = await Promise.all([listFinancingRates(), getCompany()]);
  const ultimaBusca = rates
    .map((r) => r.bcbFetchedAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const ligado = company.showroomSimulator;
  const semTaxa = rates.filter((r) => r.active && !r.monthlyRate && !r.bcbMonthlyRate);

  const rows: RateRow[] = rates.map((r) => ({
    id: r.id,
    name: r.name,
    monthlyRate: r.monthlyRate,
    maxInstallments: r.maxInstallments,
    minDownPercent: r.minDownPercent,
    bcbInstitution: r.bcbInstitution,
    bcbMonthlyRate: r.bcbMonthlyRate,
    bcbReferenceDate: r.bcbReferenceDate ? r.bcbReferenceDate.toISOString() : null,
    active: r.active,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Financiamento na vitrine"
        description="Financeiras e taxas usadas no simulador que o cliente vê no anúncio"
        action={
          <LinkButton href="/parametros" variant="secondary">
            ← Parâmetros
          </LinkButton>
        }
      />

      <Card className={ligado ? "border-emerald-300" : ""}>
        <CardHeader
          title="Simulador da vitrine"
          description={
            ligado
              ? "Ligado: o anúncio mostra a parcela estimada de cada financeira."
              : "Desligado: o anúncio não mostra simulação."
          }
          action={ligado ? <Badge tone="success">Ligado</Badge> : <Badge>Desligado</Badge>}
        />
        <div className="space-y-3 p-5">
          <SimulatorToggle on={ligado} />
          <p className="text-xs text-slate-500">{SIMULATOR_DISCLAIMER}</p>
          {ligado && rows.filter((r) => r.active).length === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Nenhuma financeira ativa — o simulador não aparece até você cadastrar pelo menos uma com taxa.
            </p>
          ) : null}
          {semTaxa.length > 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {semTaxa.map((r) => r.name).join(", ")} está sem taxa: enquanto isso, fica fora do simulador.
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Financeiras"
          description="A taxa que você negociou tem prioridade; sem ela, entra a média do Banco Central."
        />
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nenhuma financeira cadastrada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {r.name}
                      {r.active ? null : <span className="ml-2 text-xs font-normal text-slate-400">inativa</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {r.monthlyRate != null ? (
                        <>
                          <strong>{r.monthlyRate.toFixed(2).replace(".", ",")}% a.m.</strong>{" "}
                          <span className="text-xs text-slate-400">(taxa da loja)</span>
                        </>
                      ) : r.bcbMonthlyRate != null ? (
                        <>
                          <strong>{r.bcbMonthlyRate.toFixed(2).replace(".", ",")}% a.m.</strong>{" "}
                          <span className="text-xs text-slate-400">
                            (média do Banco Central
                            {r.bcbReferenceDate ? ` em ${formatDate(new Date(r.bcbReferenceDate))}` : ""})
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-700">sem taxa cadastrada</span>
                      )}
                      {" · "}até {r.maxInstallments}× · entrada mínima {r.minDownPercent}%
                    </p>
                  </div>
                  <RateRowActions rate={r} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Taxa de referência do Banco Central"
          description="Usada só onde você não cadastrou a sua própria taxa"
        />
        <div className="p-5">
          <BcbSyncCard ultimaBusca={ultimaBusca ? formatDate(ultimaBusca) : null} />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Nova financeira" />
        <div className="p-5">
          <RateForm />
        </div>
      </Card>
    </div>
  );
}
