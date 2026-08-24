import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import VehicleForm from "../../VehicleForm";
import { parseDebtItems } from "@/lib/vehicle-debts";
import { getCompany } from "@/lib/company";
import { RENAVE_PRAZO_PADRAO } from "@/lib/renave";

export const dynamic = "force-dynamic";

export default async function EditarVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAction("estoque", "editar");
  const { id } = await params;
  const [vehicle, suppliers, company] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    getCompany(),
  ]);
  const renavePrazo = (company.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Editar veículo" description={`${vehicle.brand} ${vehicle.model} · placa ${vehicle.plate}`} />
      <Card>
        <CardHeader title="Dados do veículo" />
        <div className="p-5">
          <VehicleForm
            suppliers={suppliers}
            vehicle={{ ...vehicle, debtsItems: parseDebtItems(vehicle.debtsItems) }}
            renavePrazo={renavePrazo}
          />
        </div>
      </Card>
    </div>
  );
}
