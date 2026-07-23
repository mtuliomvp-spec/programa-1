import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import CapitalTransactionForm from "./CapitalTransactionForm";
import DeleteTransactionButton from "./DeleteTransactionButton";
import IncludeClosingToggle from "./IncludeClosingToggle";
import ProLaboreForm from "./ProLaboreForm";

export const dynamic = "force-dynamic";

const kindLabel = { APORTE: "Aporte", RETIRADA: "Retirada", PRO_LABORE: "Pró-labore" } as const;
const kindTone = { APORTE: "success", RETIRADA: "danger", PRO_LABORE: "info" } as const;

export default async function BeneficiarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { id },
    include: { transactions: { orderBy: { date: "desc" } } },
  });
  if (!beneficiary) notFound();

  const sum = (kind: string) =>
    beneficiary.transactions.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
  const aportes = sum("APORTE");
  const retiradas = sum("RETIRADA");
  const proLabore = sum("PRO_LABORE");

  return (
    <div>
      <PageHeader
        title={beneficiary.name}
        description={
          beneficiary.proLabore > 0
            ? `Pró-labore combinado: ${formatCurrency(beneficiary.proLabore)}/mês`
            : "Beneficiário de capital"
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Aportes" value={formatCurrency(aportes)} tone="positive" />
        <StatCard label="Retiradas" value={formatCurrency(retiradas)} tone="negative" />
        <StatCard
          label="Saldo investido"
          value={formatCurrency(aportes - retiradas)}
          tone={aportes - retiradas >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Pró-labore pago" value={formatCurrency(proLabore)} />
      </div>

      {!beneficiary.isCompany ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProLaboreForm beneficiaryId={beneficiary.id} initial={beneficiary.proLabore} />
          <IncludeClosingToggle
            beneficiaryId={beneficiary.id}
            initial={beneficiary.includeInMonthlyClosing}
            hasProLabore={beneficiary.proLabore > 0}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Movimentações"
            description="Cada lançamento entra automaticamente no caixa da loja"
          />
          {beneficiary.transactions.length === 0 ? (
            <EmptyState title="Nenhuma movimentação" description="Registre o primeiro aporte ao lado." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Data</Th>
                  <Th>Tipo</Th>
                  <Th>Descrição</Th>
                  <Th className="text-right">Valor</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {beneficiary.transactions.map((t) => (
                  <Tr key={t.id}>
                    <Td className="whitespace-nowrap">{formatDate(t.date)}</Td>
                    <Td>
                      <Badge tone={kindTone[t.kind]}>{kindLabel[t.kind]}</Badge>
                    </Td>
                    <Td>{t.description || "—"}</Td>
                    <Td
                      className={`text-right font-medium tabular-nums ${
                        t.kind === "APORTE" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {t.kind === "APORTE" ? "+" : "−"}
                      {formatCurrency(t.amount)}
                    </Td>
                    <Td>
                      <DeleteTransactionButton id={t.id} beneficiaryId={beneficiary.id} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Nova movimentação" />
          <div className="p-5">
            <CapitalTransactionForm beneficiaryId={beneficiary.id} />
          </div>
        </Card>
      </div>
    </div>
  );
}
