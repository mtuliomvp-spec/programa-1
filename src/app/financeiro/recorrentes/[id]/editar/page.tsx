import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import { toDateInputValue } from "@/lib/format";
import { listCategoryNames, CATEGORIA_PAGAR_LABEL, CATEGORIA_RECEBER_LABEL } from "@/lib/categories";
import RecurringForm from "../../novo/RecurringForm";

export const dynamic = "force-dynamic";

export default async function EditarRecorrenciaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAction("financeiro", "criar");
  const { id } = await params;

  const entry = await prisma.recurringEntry.findUnique({
    where: { id },
    include: { supplier: { select: { name: true } } },
  });
  if (!entry) notFound();

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

  // Rótulo da categoria para preencher o campo (fallback no enum quando o
  // registro antigo ainda não tem rótulo salvo).
  const enumLabel =
    entry.kind === "PAGAR"
      ? entry.categoryPagar
        ? CATEGORIA_PAGAR_LABEL[entry.categoryPagar]
        : null
      : entry.categoryReceber
        ? CATEGORIA_RECEBER_LABEL[entry.categoryReceber]
        : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Editar recorrência"
        action={
          <LinkButton href="/financeiro/recorrentes" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />
      <Card>
        <CardHeader title="Dados da recorrência" />
        <div className="p-5">
          <RecurringForm
            id={entry.id}
            suppliers={suppliers}
            customers={customers}
            beneficiaries={beneficiaries}
            despesaCategories={despesaCategories}
            receitaCategories={receitaCategories}
            initial={{
              kind: entry.kind,
              description: entry.description,
              amount: entry.amount,
              structuralKey: entry.structuralKey ?? "ADMINISTRATIVO",
              periodicidade: entry.intervalDays ? "DIAS" : "MENSAL",
              dayOfMonth: entry.dayOfMonth,
              intervalDays: entry.intervalDays,
              anticipateToBusinessDay: entry.anticipateToBusinessDay,
              cardInvoice: entry.cardInvoice,
              categoryLabel: entry.categoryLabel ?? enumLabel,
              supplierName: entry.supplier?.name ?? "",
              customerId: entry.customerId,
              capitalBeneficiaryId: entry.capitalBeneficiaryId,
              startDate: toDateInputValue(entry.startDate),
              endDate: entry.endDate ? toDateInputValue(entry.endDate) : null,
              notes: entry.notes,
            }}
          />
        </div>
      </Card>
    </div>
  );
}
