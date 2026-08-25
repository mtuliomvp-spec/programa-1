import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { listCategoryNames } from "@/lib/categories";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import ImportRecurringDoc from "./ImportRecurringDoc";

export const dynamic = "force-dynamic";
// A leitura do documento chama a IA; um carnê longo pode levar um tempo.
export const maxDuration = 300;

/**
 * Cadastra uma recorrência a partir do documento que chegou — no lugar dos
 * importadores fixos que existiam antes (impostos, cartão, plano de saúde),
 * cada um preso a um boleto específico e já cumpridos.
 */
export default async function ImportarRecorrenciaPage() {
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
        title="Importar do documento"
        description="Anexe o boleto ou o carnê e o sistema monta a recorrência para você conferir"
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/financeiro/recorrentes/novo" variant="secondary">
              ✏️ Cadastrar à mão
            </LinkButton>
            <LinkButton href="/financeiro/recorrentes" variant="secondary">
              ← Recorrentes
            </LinkButton>
          </div>
        }
      />
      <Card>
        <CardHeader
          title="Do papel para a recorrência"
          description="Serve para qualquer conta que se repete: imposto, plano de saúde, aluguel, mensalidade, fatura."
        />
        <div className="p-5">
          <ImportRecurringDoc
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
