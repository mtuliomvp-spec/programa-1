import { Card, CardHeader, PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";
import { createCustomerAction } from "../actions";

export const dynamic = "force-dynamic";

export default function NovoClientePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novo cliente" />
      <Card>
        <CardHeader title="Dados do cliente" />
        <div className="p-5">
          <PersonForm action={createCustomerAction} documentLabel="CPF / CNPJ" />
        </div>
      </Card>
    </div>
  );
}
