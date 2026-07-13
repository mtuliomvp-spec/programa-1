import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import ManualPayableForm from "./ManualPayableForm";

export const dynamic = "force-dynamic";

const DEFAULT_CATEGORIES = ["Outros", "Despesa operacional", "Comissão", "Salário", "Combustível"];

export default async function NovaContaPagarPage() {
  const [suppliers, costCenters, stockVehicles, beneficiaries, customCategories] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.costCenter.findMany({
      where: { active: true, structural: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, brand: true, model: true, plate: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.launchCategory.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...customCategories.map((c) => c.name)]),
  );
  const vehicles = stockVehicles.map((v) => ({ id: v.id, label: `${v.brand} ${v.model} · ${v.plate}` }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova conta a pagar" description="Lançamento manual (despesas, comissões, outros)" />
      <Card>
        <CardHeader title="Dados da conta" />
        <div className="p-5">
          <ManualPayableForm
            supplierNames={suppliers.map((s) => s.name)}
            costCenters={costCenters}
            vehicles={vehicles}
            beneficiaries={beneficiaries}
            categories={categories}
          />
        </div>
      </Card>
    </div>
  );
}
