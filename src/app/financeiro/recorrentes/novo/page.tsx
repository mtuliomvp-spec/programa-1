import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import RecurringForm from "./RecurringForm";

export const dynamic = "force-dynamic";

export default async function NovaRecorrenciaPage() {
  const [suppliers, customers] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nova recorrência"
        description="O sistema lança esta conta automaticamente todo mês, no dia escolhido"
      />
      <Card>
        <CardHeader title="Dados da recorrência" />
        <div className="p-5">
          <RecurringForm suppliers={suppliers} customers={customers} />
        </div>
      </Card>
    </div>
  );
}
