import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActionAny } from "@/lib/guards";
import { listCategoryNames, labelForReceber } from "@/lib/categories";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import EditReceivableForm from "./EditReceivableForm";

export const dynamic = "force-dynamic";

export default async function EditarReceivablePage({ params }: { params: Promise<{ id: string }> }) {
  await requireActionAny([
    ["financeiro", "criar"],
    ["financeiro", "editar"],
  ]);
  const { id } = await params;

  const receivable = await prisma.receivable.findUnique({
    where: { id },
    include: { costCenter: { select: { key: true } } },
  });
  if (!receivable) notFound();
  // Recebido movimenta conta e resultado; e o que vem de venda/peça/recorrência
  // se ajusta na origem — nos dois casos a tela nem abre.
  if (
    receivable.status === "RECEBIDO" ||
    receivable.saleId ||
    receivable.partSaleId ||
    receivable.recurringId
  ) {
    redirect("/financeiro/a-receber");
  }

  const [customers, costCenters, beneficiaries, categories] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.costCenter.findMany({
      where: { active: true, structural: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listCategoryNames("RECEITA"),
  ]);

  // Fluxo atual: beneficiário → Capital; senão o centro estrutural do título.
  const flow =
    receivable.capitalBeneficiaryId || receivable.costCenter?.key === "CAPITAL"
      ? "CAPITAL"
      : "ADMINISTRATIVO";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Editar título a receber"
        action={
          <LinkButton href="/financeiro/a-receber" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />
      <Card>
        <CardHeader title="Dados do título" />
        <div className="p-5">
          <EditReceivableForm
            receivable={{
              id: receivable.id,
              description: receivable.description,
              categoryLabel: labelForReceber(receivable.categoryLabel, receivable.category),
              documentNumber: receivable.documentNumber,
              amount: receivable.amount,
              dueDate: receivable.dueDate.toISOString(),
              customerId: receivable.customerId,
              capitalBeneficiaryId: receivable.capitalBeneficiaryId,
              // Centro de obra/imóvel escolhido à mão (os estruturais vêm do fluxo).
              costCenterId: receivable.costCenter?.key ? null : receivable.costCenterId,
              structuralKey: flow,
              notes: receivable.notes,
            }}
            customers={customers}
            costCenters={costCenters}
            beneficiaries={beneficiaries}
            categories={categories}
          />
        </div>
      </Card>
    </div>
  );
}
