import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import { listCategoryNames } from "@/lib/categories";
import RecurringForm from "./RecurringForm";

export const dynamic = "force-dynamic";

export default async function NovaRecorrenciaPage() {
  await requireAction("financeiro", "criar");
  const [suppliers, customers, beneficiaries, despesaCategories, receitaCategories] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    listCategoryNames("DESPESA"),
    listCategoryNames("RECEITA"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nova recorrência"
        description="O sistema lança esta conta automaticamente todo mês, no dia escolhido"
      />
      <Card>
        <CardHeader title="Dados da recorrência" />
        <div className="p-5">
          <RecurringForm
            suppliers={suppliers}
            customers={customers}
            beneficiaries={beneficiaries}
            despesaCategories={despesaCategories}
            receitaCategories={receitaCategories}
          />
        </div>
      </Card>
    </div>
  );
}
