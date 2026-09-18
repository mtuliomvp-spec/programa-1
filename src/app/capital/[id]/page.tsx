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
import BeneficiaryParentSelect from "./BeneficiaryParentSelect";
import LinkedBeneficiaries from "./LinkedBeneficiaries";
import SubstitutionWithdrawForm from "./SubstitutionWithdrawForm";
import { isAdminRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const kindLabel = { APORTE: "Aporte", RETIRADA: "Retirada", PRO_LABORE: "Pró-labore" } as const;
const kindTone = { APORTE: "success", RETIRADA: "danger", PRO_LABORE: "info" } as const;

/** Razão do capital aplicado (o que forma o "Aplicado" do sócio). */
const alocacaoLabel = {
  APLICAR: "Aplicação",
  RESGATAR: "Resgate",
  RENDIMENTO: "Rendimento",
  SUBSTITUICAO: "Substituição",
} as const;

export default async function BeneficiarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { id },
    include: {
      // Ordem estável (data e, no mesmo dia, a hora do registro): é sobre ela
      // que o saldo acumulado de cada linha é calculado.
      transactions: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      parent: { select: { id: true, name: true } },
    },
  });
  if (!beneficiary) notFound();

  const canManage = await userCan("administrativo", "capital");
  const sessionUser = await getSessionUser();
  const isAdmin = isAdminRole(sessionUser?.role);
  // Lista de usuários para o vínculo (só admin vê o controle).
  const linkableUsers = isAdmin && !beneficiary.isCompany
    ? await prisma.user.findMany({
        where: { active: true, pending: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Agrupamento pai→filhos (ex.: cauções). Só visual — não muda cálculos.
  const isChild = beneficiary.parentId != null;
  const [childrenRaw, eligibleChildren, eligibleParents] = await Promise.all([
    prisma.capitalBeneficiary.findMany({
      where: { parentId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, transactions: { select: { kind: true, amount: true } } },
    }),
    // Podem virar vinculados: não-empresa, sem responsável, sem filhos próprios.
    canManage && !beneficiary.isCompany && !isChild
      ? prisma.capitalBeneficiary.findMany({
          where: { isCompany: false, parentId: null, id: { not: id }, children: { none: {} } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    // Podem ser responsáveis: não-empresa, de topo (sem responsável).
    prisma.capitalBeneficiary.findMany({
      where: { isCompany: false, parentId: null, id: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const childrenList = childrenRaw.map((c) => ({
    id: c.id,
    name: c.name,
    saldo:
      Math.round(
        c.transactions.reduce(
          (s, t) => s + (t.kind === "APORTE" ? t.amount : t.kind === "RETIRADA" ? -t.amount : 0),
          0,
        ) * 100,
      ) / 100,
  }));
  const isParent = childrenList.length > 0;

  const sum = (kind: string) =>
    beneficiary.transactions.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
  const aportes = sum("APORTE");
  const retiradas = sum("RETIRADA");
  const proLabore = sum("PRO_LABORE");

  // Saldo acumulado DEPOIS de cada lançamento, como no extrato do banco: soma
  // de baixo para cima (do mais antigo ao mais novo) e guarda o saldo de cada
  // linha. O pró-labore não entra — ele é despesa da loja, não capital —, então
  // a linha dele repete o saldo anterior. A linha do topo fecha no "Saldo
  // investido"; é assim que se acha o lançamento em que a conta desandou.
  const saldoApos = new Map<string, number>();
  {
    let acumulado = 0;
    for (const t of [...beneficiary.transactions].reverse()) {
      acumulado += t.kind === "APORTE" ? t.amount : t.kind === "RETIRADA" ? -t.amount : 0;
      saldoApos.set(t.id, Math.round(acumulado * 100) / 100);
    }
  }

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

  // Razão do capital APLICADO: o "Aplicado" muda o capital LIVRE do sócio sem
  // passar pelas Movimentações (que são aportes/retiradas), então sem esta
  // lista um valor preso na aplicação — uma fatia assumida por substituição,
  // por exemplo — some do livre sem nenhum lugar onde conferir de onde veio.
  const alocacoes = await prisma.investmentAllocation.findMany({
    where: { beneficiaryId: beneficiary.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      amount: true,
      date: true,
      description: true,
      account: { select: { id: true, name: true } },
    },
  });

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

      {alocacoes.length > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title="Capital aplicado — de onde vem"
            description="O aplicado desconta do capital livre sem passar pelas movimentações; aqui está cada pedaço dele."
          />
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Descrição</Th>
                <Th className="text-right">Valor</Th>
              </Tr>
            </Thead>
            <tbody>
              {alocacoes.map((a) => (
                <Tr key={a.id}>
                  <Td className="whitespace-nowrap">{formatDate(a.date)}</Td>
                  <Td>
                    <Badge tone={a.amount >= 0 ? "info" : "warning"}>{alocacaoLabel[a.kind]}</Badge>
                  </Td>
                  <Td>
                    {a.description || "—"}
                    {a.account?.name ? (
                      <span className="block text-xs text-slate-400">{a.account.name}</span>
                    ) : null}
                  </Td>
                  <Td
                    className={`text-right font-medium tabular-nums ${
                      a.amount >= 0 ? "text-slate-800" : "text-emerald-600"
                    }`}
                  >
                    {a.amount >= 0 ? "" : "−"}
                    {formatCurrency(Math.abs(a.amount))}
                  </Td>
                </Tr>
              ))}
              <Tr>
                <Td className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total aplicado</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className="text-right font-bold tabular-nums text-slate-900">
                  {formatCurrency(appliedTotal)}
                </Td>
              </Tr>
            </tbody>
          </Table>
        </Card>
      ) : null}

      {isChild && beneficiary.parent ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          🏠 Caução vinculada a{" "}
          <a href={`/capital/${beneficiary.parent.id}`} className="font-medium text-blue-700 hover:underline">
            {beneficiary.parent.name}
          </a>
          . O saldo continua contando no capital total.
        </p>
      ) : null}

      {!beneficiary.isCompany && canManage && !isChild ? (
        <div className="mb-4">
          <LinkedBeneficiaries
            parentId={beneficiary.id}
            childrenList={childrenList}
            eligible={eligibleChildren}
            today={toDateInputValue(new Date())}
          />
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
          {canManage && !isParent ? (
            <BeneficiaryParentSelect
              beneficiaryId={beneficiary.id}
              parents={eligibleParents}
              currentParentId={beneficiary.parentId}
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
            description="Cada lançamento entra automaticamente no caixa da loja · o saldo ao lado é o acumulado depois daquele lançamento"
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
                  <Th className="text-right">Saldo</Th>
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
                    <Td
                      className={`whitespace-nowrap text-right tabular-nums ${
                        (saldoApos.get(t.id) ?? 0) < 0 ? "text-rose-600" : "text-slate-700"
                      }`}
                    >
                      {formatCurrency(saldoApos.get(t.id) ?? 0)}
                      {t.kind === "PRO_LABORE" ? (
                        <span className="block text-[11px] text-slate-400">não muda o saldo</span>
                      ) : null}
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
