import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import ManualPayableForm from "./ManualPayableForm";

export const dynamic = "force-dynamic";

export default async function NovaContaPagarPage() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova conta a pagar" description="Lançamento manual (despesas, comissões, outros)" />
      <Card>
        <CardHeader title="Dados da conta" />
        <div className="p-5">
          <ManualPayableForm suppliers={suppliers} />
        </div>
      </Card>
    </div>
  );
}
