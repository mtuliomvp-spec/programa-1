import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { toDateInputValue } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import AccountForm from "../../AccountForm";

export const dynamic = "force-dynamic";

/**
 * Edição da conta financeira. Nome, banco, agência, número, tipo e titular
 * eram pedidos só no cadastro e depois ficavam congelados — uma agência
 * digitada errada não tinha conserto, e é por ela que o comprovante de
 * pagamento reconhece sozinho a conta debitada.
 */
export default async function EditarContaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAction("financeiro", "contas");
  const { id } = await params;

  const [conta, beneficiaries, transferencias] = await Promise.all([
    prisma.financialAccount.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        structural: true,
        bankName: true,
        agency: true,
        accountNumber: true,
        initialBalance: true,
        isInvestment: true,
        investmentMaturity: true,
        returnTaxPercent: true,
        ownerBeneficiaryId: true,
        _count: { select: { payables: true, receivables: true } },
      },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { isCompany: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.accountTransfer.count({ where: { OR: [{ fromId: id }, { toId: id }] } }),
  ]);
  if (!conta) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Editar conta"
        description={conta.name}
        action={
          <LinkButton href="/financeiro/contas" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />

      {conta.structural ? (
        <Card className="p-5">
          <p className="text-sm text-amber-800">
            O <strong>Banco Neutro</strong> é uma conta do próprio sistema (conta de compensação
            das trocas e dos pares débito/crédito). Os dados dela não são editáveis.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Dados da conta"
            description="O que identifica a conta no banco e nas telas do sistema"
          />
          <div className="p-5">
            <AccountForm
              beneficiaries={beneficiaries}
              initial={{
                id: conta.id,
                name: conta.name,
                type: conta.type,
                bankName: conta.bankName,
                agency: conta.agency,
                accountNumber: conta.accountNumber,
                initialBalance: conta.initialBalance,
                isInvestment: conta.isInvestment,
                investmentMaturity: conta.investmentMaturity
                  ? toDateInputValue(conta.investmentMaturity)
                  : null,
                returnTaxPercent: conta.returnTaxPercent,
                ownerBeneficiaryId: conta.ownerBeneficiaryId,
                temMovimento:
                  conta._count.payables > 0 || conta._count.receivables > 0 || transferencias > 0,
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
