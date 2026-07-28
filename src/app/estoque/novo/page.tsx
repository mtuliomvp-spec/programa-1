import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import VehicleForm from "../VehicleForm";

export const dynamic = "force-dynamic";

export default async function NovoVeiculoPage() {
  await requireAction("estoque", "criar");
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo veículo" description="Cadastre um veículo no estoque" />
      <Card>
        <CardHeader title="Dados do veículo" description="Campos marcados com * são obrigatórios" />
        <div className="p-5">
          <VehicleForm suppliers={suppliers} />
        </div>
      </Card>
    </div>
  );
}
