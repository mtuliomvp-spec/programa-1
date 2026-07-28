import { Card, CardHeader, PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";
import { requireAction } from "@/lib/guards";
import { createCustomerAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  await requireAction("cadastros", "criar");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo cliente" />
      <Card>
        <CardHeader title="Dados do cliente" />
        <div className="p-5">
          <PersonForm
            action={createCustomerAction}
            documentLabel="CPF / CNPJ"
            replicate={{ name: "alsoSupplier", label: "fornecedor" }}
          />
        </div>
      </Card>
    </div>
  );
}
