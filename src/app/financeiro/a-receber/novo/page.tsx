import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import ManualReceivableForm from "./ManualReceivableForm";

export const dynamic = "force-dynamic";

export default async function NovaContaReceberPage() {
  await requireAction("financeiro", "criar");
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });
  const costCenters = await prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova conta a receber" description="Lançamento manual" />
      <Card>
        <CardHeader title="Dados da conta" />
        <div className="p-5">
          <ManualReceivableForm customers={customers} costCenters={costCenters} />
        </div>
      </Card>
    </div>
  );
}
