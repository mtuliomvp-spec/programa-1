import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getActiveAccounts } from "@/lib/accounts";
import { requireAction } from "@/lib/guards";
import { listCategoryNames } from "@/lib/categories";
import ReconcileClient from "./ReconcileClient";

export const dynamic = "force-dynamic";

export default async function ConciliacaoPage() {
  await requireAction("financeiro", "conciliar");
  const [accounts, suppliers, customers, allVehicles, beneficiaries, costCenters, despesas, receitas] =
    await Promise.all([
      getActiveAccounts(),
      prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.vehicle.findMany({
        // Inclui vendidos (despesa pós-venda); em estoque primeiro.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: { id: true, brand: true, model: true, plate: true, status: true },
      }),
      prisma.capitalBeneficiary.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.costCenter.findMany({
        where: { active: true, structural: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      listCategoryNames("DESPESA"),
      listCategoryNames("RECEITA"),
    ]);

  const vehicles = allVehicles.map((v) => ({
    id: v.id,
    label: `${v.brand} ${v.model} · ${v.plate}${v.status === "VENDIDO" ? " (vendido)" : ""}`,
  }));

  return (
    <div>
      <PageHeader
        title="Conciliação bancária"
        description="Importe o extrato do banco (arquivo OFX) e confira com o que está no sistema"
      />
      <ReconcileClient
        accounts={accounts}
        supplierNames={suppliers.map((s) => s.name)}
        customers={customers}
        vehicles={vehicles}
        beneficiaries={beneficiaries}
        costCenters={costCenters}
        despesaCategories={despesas}
        receitaCategories={receitas}
      />
    </div>
  );
}
