import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { getParecerConfig } from "@/lib/parecer-ia";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import CompanyForm from "./CompanyForm";

export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/");

  const company = await getCompany();
  // A chave da IA NUNCA vai ao cliente — envia só o indicador de que existe.
  // `aiKeyFromEnv` avisa que a instalação já tem uma chave própria (variável de
  // ambiente), então a IA funciona mesmo sem nada salvo aqui.
  const { aiApiKey, ...rest } = company;
  const { fromEnv: aiKeyFromEnv } = await getParecerConfig();
  const companyForClient = { ...rest, hasAiKey: !!aiApiKey?.trim(), aiKeyFromEnv };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Parâmetros da empresa"
        description="Dados da MVP Veículos usados nos documentos impressos (ordem de compra, contrato e venda)"
      />
      <Card>
        <CardHeader title="Dados da empresa" />
        <div className="p-5">
          <CompanyForm company={companyForClient} />
        </div>
      </Card>
    </div>
  );
}
