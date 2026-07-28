import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import VehicleForm from "../../VehicleForm";

export const dynamic = "force-dynamic";

export default async function EditarVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAction("estoque", "editar");
  const { id } = await params;
  const [vehicle, suppliers] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Editar veículo" description={`${vehicle.brand} ${vehicle.model} · placa ${vehicle.plate}`} />
      <Card>
        <CardHeader title="Dados do veículo" />
        <div className="p-5">
          <VehicleForm suppliers={suppliers} vehicle={vehicle} />
        </div>
      </Card>
    </div>
  );
}
