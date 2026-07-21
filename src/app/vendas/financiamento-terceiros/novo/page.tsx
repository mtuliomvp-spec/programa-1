import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/guards";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import IntermediationForm from "../IntermediationForm";

export const dynamic = "force-dynamic";

export default async function NovoFinanciamentoTerceirosPage() {
  await requireModule("vendas");

  const [customers, financers, users] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.financialAccount.findMany({
      where: { active: true, type: "FINANCEIRA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, returnTaxPercent: true, sellerReturnPercent: true },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Financiamento de terceiros"
        description="A loja apenas intermedeia o financiamento de um veículo de terceiro. O carro não entra no estoque."
      />
      <Card>
        <CardHeader title="Dados da operação" />
        <div className="p-5">
          <IntermediationForm customers={customers} financers={financers} users={users} />
        </div>
      </Card>
    </div>
  );
}
