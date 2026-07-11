import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import CompanyForm from "./CompanyForm";

export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/");

  const company = await getCompany();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Parâmetros da empresa"
        description="Dados da MVP Veículos usados nos documentos impressos (ordem de compra, contrato e venda)"
      />
      <Card>
        <CardHeader title="Dados da empresa" />
        <div className="p-5">
          <CompanyForm company={company} />
        </div>
      </Card>
    </div>
  );
}
