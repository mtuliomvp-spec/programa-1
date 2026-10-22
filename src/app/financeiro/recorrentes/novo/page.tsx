import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction, requireModule } from "@/lib/guards";
import { listCategoryNames } from "@/lib/categories";
import RecurringForm from "./RecurringForm";

export const dynamic = "force-dynamic";

export default async function NovaRecorrenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ imovel?: string }>;
}) {
  await requireModule("financeiro");
  await requireAction("financeiro", "recorrentes");
  // Vindo da ficha de um imóvel ("Nova conta recorrente"): já nasce ligada a ele.
  const { imovel } = await searchParams;
  const [suppliers, customers, beneficiaries, despesaCategories, receitaCategories, imoveis] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    listCategoryNames("DESPESA"),
    listCategoryNames("RECEITA"),
    prisma.imovel.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const imovelInicial = imoveis.find((i) => i.id === imovel) ?? null;

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
            imoveis={imoveis.map((i) => ({ id: i.id, name: i.nome }))}
            initial={
              imovelInicial
                ? {
                    kind: "PAGAR",
                    description: "",
                    amount: 0,
                    structuralKey: "ADMINISTRATIVO",
                    periodicidade: "ANUAL",
                    dayOfMonth: 5,
                    intervalDays: null,
                    anticipateToBusinessDay: true,
                    firstReference: null,
                    cardInvoice: false,
                    categoryLabel: null,
                    supplierName: "",
                    customerId: null,
                    capitalBeneficiaryId: null,
                    startDate: new Date().toISOString().slice(0, 10),
                    endDate: null,
                    notes: null,
                    imovelId: imovelInicial.id,
                  }
                : undefined
            }
          />
        </div>
      </Card>
    </div>
  );
}
