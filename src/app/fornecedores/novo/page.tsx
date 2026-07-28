import { Card, CardHeader, PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";
import { requireAction } from "@/lib/guards";
import { createSupplierAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoFornecedorPage() {
  await requireAction("cadastros", "criar");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo fornecedor" />
      <Card>
        <CardHeader title="Dados do fornecedor" />
        <div className="p-5">
          <PersonForm
            action={createSupplierAction}
            documentLabel="CPF / CNPJ"
            replicate={{ name: "alsoCustomer", label: "cliente" }}
            showBankData
          />
        </div>
      </Card>
    </div>
  );
}
