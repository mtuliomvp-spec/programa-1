import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import ManualReceivableForm from "./ManualReceivableForm";

export const dynamic = "force-dynamic";

export default async function NovaContaReceberPage() {
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova conta a receber" description="Lançamento manual" />
      <Card>
        <CardHeader title="Dados da conta" />
        <div className="p-5">
          <ManualReceivableForm customers={customers} />
        </div>
      </Card>
    </div>
  );
}
