import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import PartForm from "../PartForm";

export const dynamic = "force-dynamic";

export default async function NovaPecaPage() {
  await requireAction("pecas", "criar");
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova peça" />
      <Card>
        <CardHeader title="Dados da peça" />
        <div className="p-5">
          <PartForm suppliers={suppliers} />
        </div>
      </Card>
    </div>
  );
}
