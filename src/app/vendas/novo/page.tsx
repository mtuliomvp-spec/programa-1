import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import SaleForm from "../SaleForm";

export const dynamic = "force-dynamic";

export default async function NovaVendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  const { vehicleId } = await searchParams;
  const user = await getSessionUser();
  const [vehicles, customers, financers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { in: ["ESTOQUE", "RESERVADO"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, brand: true, model: true, plate: true, salePrice: true },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.financialAccount.findMany({
      where: { active: true, type: "FINANCEIRA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Sinais / entradas antecipadas já recebidas por veículo (abatidas na venda).
  const advanceRows = await prisma.receivable.groupBy({
    by: ["vehicleId"],
    where: { saleId: null, status: "RECEBIDO", vehicleId: { in: vehicles.map((v) => v.id) } },
    _sum: { amount: true },
  });
  const advances: Record<string, number> = {};
  for (const r of advanceRows) if (r.vehicleId) advances[r.vehicleId] = r._sum.amount ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova venda" description="Registrar a venda de um veículo do estoque" />
      <Card>
        <CardHeader title="Dados da venda" />
        <div className="p-5">
          <SaleForm
            vehicles={vehicles}
            customers={customers}
            financers={financers}
            advances={advances}
            preselectedVehicleId={vehicleId}
            currentUserName={user?.name}
          />
        </div>
      </Card>
    </div>
  );
}
