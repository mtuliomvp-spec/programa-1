import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction, requireModule } from "@/lib/guards";
import ManualReceivableForm from "./ManualReceivableForm";
import { getActiveAccounts } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export default async function NovaContaReceberPage() {
  await requireModule("financeiro");
  await requireAction("financeiro", "criar");
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } });
  const costCenters = await prisma.costCenter.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  // Sócios do capital: o fluxo CAPITAL pede de quem é o aporte.
  const beneficiaries = await prisma.capitalBeneficiary.findMany({
    where: { active: true },
    orderBy: [{ isCompany: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  // Fluxo Veículos: a entrada (sinal) de um carro em estoque e a conta em que cai.
  const [vehicles, accounts] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" }, intermediation: false },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      select: { id: true, brand: true, model: true, plate: true },
    }),
    getActiveAccounts(),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Nova conta a receber" description="Lançamento manual" />
      <Card>
        <CardHeader title="Dados da conta" />
        <div className="p-5">
          <ManualReceivableForm
            customers={customers}
            costCenters={costCenters}
            beneficiaries={beneficiaries}
            vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.plate} · ${v.brand} ${v.model}` }))}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          />
        </div>
      </Card>
    </div>
  );
}
