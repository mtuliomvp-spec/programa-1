import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import PersonForm from "@/components/PersonForm";
import { updateSupplierAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditarFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar fornecedor" description={supplier.name} />
      <Card>
        <CardHeader title="Dados do fornecedor" />
        <div className="p-5">
          <PersonForm action={updateSupplierAction} person={supplier} documentLabel="CPF / CNPJ" showBankData />
        </div>
      </Card>
    </div>
  );
}
