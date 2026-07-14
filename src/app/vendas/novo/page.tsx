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
            preselectedVehicleId={vehicleId}
            currentUserName={user?.name}
          />
        </div>
      </Card>
    </div>
  );
}
