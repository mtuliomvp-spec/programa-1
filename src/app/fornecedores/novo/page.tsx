import { Card, CardHeader, PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";
import { createSupplierAction } from "../actions";

export const dynamic = "force-dynamic";

export default function NovoFornecedorPage() {
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
          />
        </div>
      </Card>
    </div>
  );
}
