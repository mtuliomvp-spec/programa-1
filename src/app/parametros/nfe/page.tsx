import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { dataBr, lerNfeConfig, nfeRegimeLabel, pendenciasNfe, regraVigente } from "@/lib/nfe-config";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import NfeConfigForm from "./NfeConfigForm";

export const dynamic = "force-dynamic";

export default async function ParametrosNfePage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");

  const company = await getCompany();
  const config = lerNfeConfig(company.nfeConfig);
  const todas = pendenciasNfe(config, !!company.cnpj?.trim(), !!company.inscricaoEstadual?.trim());
  // As da mudança de regime agendada não impedem emitir hoje: ficam à parte.
  const pendencias = todas.filter((p) => !/novo regime/i.test(p));
  const futuras = todas.filter((p) => /novo regime/i.test(p));
  const hoje = regraVigente(config, new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nota fiscal (NF-e)"
        description="Emissão das notas de entrada (compra) e saída (venda) dos veículos pelo sistema"
        action={
          <LinkButton href="/parametros" variant="secondary">
            ← Parâmetros
          </LinkButton>
        }
      />

      <Card className={pendencias.length ? "border-amber-300" : ""}>
        <CardHeader
          title="Pronto para emitir?"
          action={
            pendencias.length ? (
              <Badge tone="warning">{pendencias.length} pendência(s)</Badge>
            ) : (
              <Badge tone="success">Configuração completa</Badge>
            )
          }
        />
        <div className="p-5 text-sm text-slate-600">
          {pendencias.length ? (
            <ul className="list-inside list-disc space-y-1">
              {pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p>Tudo configurado. A emissão é liberada assim que a integração com o provedor estiver ativa.</p>
          )}
          {futuras.length ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Para a mudança de regime (não impede emitir hoje):</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {futuras.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-3 text-sm">
            Regra que vale hoje:{" "}
            <strong className="text-slate-900">
              {hoje.regime ? nfeRegimeLabel[hoje.regime] : "regime não definido"}
              {hoje.icmsCst ? ` · ICMS ${hoje.icmsCst}` : ""}
            </strong>
            {config.regimeNovo && config.regimeNovoDesde && !hoje.regraNova ? (
              <>
                {" "}
                — a partir de <strong>{dataBr(config.regimeNovoDesde)}</strong>:{" "}
                {nfeRegimeLabel[config.regimeNovo]}
                {config.icmsCstNovo ? ` · ICMS ${config.icmsCstNovo}` : ""}
              </>
            ) : null}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            O token de acesso do provedor não é cadastrado nesta tela: ele fica em variável de ambiente da
            instalação, e o certificado A1 fica no painel do provedor.
          </p>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Configuração" />
        <div className="p-5">
          <NfeConfigForm config={config} />
        </div>
      </Card>
    </div>
  );
}
