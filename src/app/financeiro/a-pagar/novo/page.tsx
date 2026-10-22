import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction, requireModule } from "@/lib/guards";
import { listCategoryNames } from "@/lib/categories";
import ManualPayableForm from "./ManualPayableForm";

export const dynamic = "force-dynamic";

export default async function NovaContaPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ imovel?: string }>;
}) {
  await requireModule("financeiro");
  await requireAction("financeiro", "criar");
  const { imovel } = await searchParams;
  const [suppliers, costCenters, stockVehicles, beneficiaries, categories, imoveis] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.costCenter.findMany({
      where: { active: true, structural: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vehicle.findMany({
      // Inclui vendidos (para lançar despesas pós-venda); em estoque primeiro.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: { id: true, brand: true, model: true, plate: true, status: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listCategoryNames("DESPESA"),
    prisma.imovel.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const vehicles = stockVehicles.map((v) => ({
    id: v.id,
    label: `${v.brand} ${v.model} · ${v.plate}${v.status === "VENDIDO" ? " (vendido)" : ""}`,
  }));

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
            imoveis={imoveis}
            imovelInicial={imoveis.some((i) => i.id === imovel) ? imovel : null}
          />
        </div>
      </Card>
    </div>
  );
}
