import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";
import { updateCustomerAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar cliente" description={customer.name} />
      <Card>
        <CardHeader title="Dados do cliente" />
        <div className="p-5">
          <PersonForm action={updateCustomerAction} person={customer} documentLabel="CPF / CNPJ" />
        </div>
      </Card>
    </div>
  );
}
