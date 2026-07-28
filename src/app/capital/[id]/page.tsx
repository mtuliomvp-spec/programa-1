import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSelectableAccounts } from "@/lib/accounts";
import { appliedTotalOf, freeCapitalOf } from "@/lib/investments";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { userCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import CapitalTransactionForm from "./CapitalTransactionForm";
import DeleteTransactionButton from "./DeleteTransactionButton";
import IncludeClosingToggle from "./IncludeClosingToggle";
import ProLaboreForm from "./ProLaboreForm";
import BeneficiaryNameForm from "./BeneficiaryNameForm";
import BeneficiaryUserLink from "./BeneficiaryUserLink";
import SubstitutionWithdrawForm from "./SubstitutionWithdrawForm";

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

  const canManage = await userCan("administrativo", "capital");
  const sessionUser = await getSessionUser();
  const isAdmin = sessionUser?.role === "ADMIN";
  // Lista de usuários para o vínculo (só admin vê o controle).
  const linkableUsers = isAdmin && !beneficiary.isCompany
    ? await prisma.user.findMany({
        where: { active: true, pending: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const sum = (kind: string) =>
    beneficiary.transactions.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
  const aportes = sum("APORTE");
  const retiradas = sum("RETIRADA");
  const proLabore = sum("PRO_LABORE");

  // Capital aplicado x livre + fatias por conta de Aplicação.
  const [appliedTotal, freeCapital, appliedRows, substitutesRaw, payAccounts] = await Promise.all([
    appliedTotalOf(beneficiary.id),
    freeCapitalOf(beneficiary.id),
    prisma.investmentAllocation.groupBy({
      by: ["accountId"],
      where: { beneficiaryId: beneficiary.id },
      _sum: { amount: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true, id: { not: beneficiary.id } },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    getSelectableAccounts(),
  ]);
  const appliedAccountIds = appliedRows.filter((r) => (r._sum.amount ?? 0) > 0.005).map((r) => r.accountId);
  const appliedAccountNames = appliedAccountIds.length
    ? await prisma.financialAccount.findMany({
        where: { id: { in: appliedAccountIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(appliedAccountNames.map((a) => [a.id, a.name]));
  const appliedAccounts = appliedRows
    .filter((r) => (r._sum.amount ?? 0) > 0.005)
    .map((r) => ({
      accountId: r.accountId,
      accountName: nameById.get(r.accountId) ?? "—",
      applied: Math.round((r._sum.amount ?? 0) * 100) / 100,
    }));
  const substitutes = await Promise.all(
    substitutesRaw.map(async (s) => ({ id: s.id, name: s.name, free: await freeCapitalOf(s.id) })),
  );

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

      {appliedTotal > 0 ? (
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Capital livre" value={formatCurrency(freeCapital)} hint="disponível para sacar/aplicar" tone={freeCapital >= 0 ? "positive" : "negative"} />
            <StatCard label="Capital aplicado" value={formatCurrency(appliedTotal)} hint="investido em contas de aplicação" />
          </div>
          {appliedAccounts.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Aplicado em: {appliedAccounts.map((a) => `${a.accountName} (${formatCurrency(a.applied)})`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {!beneficiary.isCompany && appliedTotal > 0 && canManage ? (
        <div className="mb-4">
          <SubstitutionWithdrawForm
            beneficiaryId={beneficiary.id}
            appliedAccounts={appliedAccounts}
            substitutes={substitutes}
            payAccounts={payAccounts}
            today={toDateInputValue(new Date())}
          />
        </div>
      ) : null}

      {!beneficiary.isCompany && (canManage || isAdmin) ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {canManage ? (
            <BeneficiaryNameForm
              beneficiaryId={beneficiary.id}
              initial={beneficiary.name}
              linked={beneficiary.userId != null}
            />
          ) : null}
          {isAdmin ? (
            <BeneficiaryUserLink
              beneficiaryId={beneficiary.id}
              users={linkableUsers}
              currentUserId={beneficiary.userId}
            />
          ) : null}
        </div>
      ) : null}

      {!beneficiary.isCompany && canManage ? (
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
                      {canManage ? (
                        <DeleteTransactionButton id={t.id} beneficiaryId={beneficiary.id} />
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canManage ? (
          <Card className="h-fit">
            <CardHeader title="Nova movimentação" />
            <div className="p-5">
              <CapitalTransactionForm beneficiaryId={beneficiary.id} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
