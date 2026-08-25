import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { getParecerConfig } from "@/lib/parecer-ia";
import { getPlateToken } from "@/lib/api-keys";
import { isAdminRole } from "@/lib/permissions";
import { Card, CardHeader, PageHeader, LinkButton } from "@/components/ui";
import CompanyForm from "./CompanyForm";

export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");

  const company = await getCompany();
  // Nenhuma chave NUNCA vai ao cliente — só o indicador de que existe.
  // Os `*FromEnv` avisam que a instalação já tem chave própria (variável de
  // ambiente), então o recurso funciona mesmo sem nada salvo aqui.
  const { aiApiKey, plateApiToken, ...rest } = company;
  const [{ fromEnv: aiKeyFromEnv }, plateToken] = await Promise.all([
    getParecerConfig(),
    getPlateToken(),
  ]);
  const companyForClient = {
    ...rest,
    hasAiKey: !!aiApiKey?.trim(),
    aiKeyFromEnv,
    hasPlateToken: !!plateApiToken?.trim(),
    plateTokenFromEnv: plateToken.fromEnv,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Parâmetros da empresa"
        description="Dados da MVP Veículos usados nos documentos impressos (ordem de compra, contrato e venda)"
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/parametros/renave" variant="secondary">
              🚗 Renave
            </LinkButton>
            <LinkButton href="/parametros/comunicacao-venda" variant="secondary">
              📨 Comunicação de venda
            </LinkButton>
            <LinkButton href="/parametros/financiamento" variant="secondary">
              💳 Financiamento na vitrine
            </LinkButton>
          </div>
        }
      />
      <Card>
        <CardHeader title="Dados da empresa" />
        <div className="p-5">
          <CompanyForm company={companyForClient} podeChaves={user.role === "SUPER_ADMIN"} />
        </div>
      </Card>
    </div>
  );
}
