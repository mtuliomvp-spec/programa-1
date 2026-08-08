import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";
import { getBooksHealth } from "@/lib/books-health";
import { getCashboxState } from "@/lib/cashbox";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import BooksHealthChecks from "@/components/BooksHealthChecks";
import { userCan } from "@/lib/guards";
import CashboxCard from "./CashboxCard";
import AccountForm from "./AccountForm";
import TransferForm from "./TransferForm";
import AccountRowActions from "./AccountRowActions";
import DeleteTransferButton from "./DeleteTransferButton";

export const dynamic = "force-dynamic";

const typeLabel = { CAIXA: "Caixa físico", BANCO: "Banco", POUPANCA: "Poupança", FINANCEIRA: "Financeira", OUTRO: "Outro" } as const;

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  // O farol também precisa dos saldos: pede-se UMA vez e repassa-se a promessa
  // (antes esta tela calculava a mesma soma três vezes por visita).
  const accountsPromise = getAccountsWithBalances();
  const [accounts, transfers, health, cashbox, cashboxHistory, owners, beneficiaries] = await Promise.all([
    accountsPromise,
    prisma.accountTransfer.findMany({
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 20,
    }),
    getBooksHealth(accountsPromise),
    getCashboxState(),
    prisma.cashboxSession.findMany({ orderBy: { openedAt: "desc" }, take: 30 }),
    // Titular verdadeiro de cada conta (quando é de um sócio, não da MVP).
    prisma.financialAccount.findMany({
      where: { ownerBeneficiaryId: { not: null } },
      select: { id: true, ownerBeneficiary: { select: { name: true } } },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { isCompany: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const ownerByAccount = new Map(owners.map((o) => [o.id, o.ownerBeneficiary?.name ?? null]));

  const canContas = await userCan("financeiro", "contas");
  const active = accounts.filter((a) => a.active);
  // A financeira é tratada como uma conta real: entra no saldo total como as
  // demais (o valor financiado fica nela até a financeira transferir).
  const totalBalance = active.reduce((s, a) => s + a.balance, 0);
  // Busca livre filtra só os cards de conta exibidos (os totais acima seguem
  // considerando todas as contas).
  const accountRows = accounts.filter((a) =>
    matchesSearch(q, a.name, typeLabel[a.type], a.bankName, a.accountNumber, a.balance, formatCurrency(a.balance)),
  );

  const renderAccountCard = (a: (typeof accounts)[number]) => (
    <Card key={a.id} className={`px-5 py-4 ${!a.active ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/financeiro/contas/${a.id}`} className="group min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 group-hover:text-blue-700">
            {a.isInvestment ? "📈" : a.type === "BANCO" ? "🏦" : a.type === "POUPANCA" ? "🐷" : a.type === "FINANCEIRA" ? "🏢" : "💵"} {a.name}
            <Badge tone={a.isInvestment ? "success" : "default"}>{a.isInvestment ? "Aplicação" : typeLabel[a.type]}</Badge>
            {a.isDefault ? <Badge tone="info">Padrão</Badge> : null}
            {ownerByAccount.get(a.id) ? (
              <Badge tone="warning">👤 Titular: {ownerByAccount.get(a.id)}</Badge>
            ) : null}
            {!a.active ? <Badge tone="danger">Inativa</Badge> : null}
            <span className="text-xs font-normal text-blue-600 group-hover:underline">
              {a.isInvestment ? "abrir / creditar →" : "ver extrato →"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[a.bankName, a.agency && `ag. ${a.agency}`, a.accountNumber && `conta ${a.accountNumber}`]
              .filter(Boolean)
              .join(" · ") || "—"}
            {" · "}inicial {formatCurrency(a.initialBalance)} · entradas {formatCurrency(a.received + a.transfersIn)} · saídas {formatCurrency(a.paid + a.transfersOut)}
          </p>
          {a.isInvestment ? (
            <p className="mt-0.5 text-xs font-medium text-emerald-700">
              Para creditar, abra a conta e use <strong>Aplicar</strong> — o dinheiro é dividido entre os sócios.
            </p>
          ) : null}
        </Link>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Saldo</p>
            <p className={`text-lg font-bold ${a.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(a.balance)}
            </p>
          </div>
          {/* data-no-pdf: os botões de ação ficam fora do PDF de saldos. */}
          <div data-no-pdf className="flex items-center gap-4">
            {a.isInvestment && a.active && canContas ? (
              <LinkButton href={`/financeiro/contas/${a.id}`} className="whitespace-nowrap">
                📈 Aplicar
              </LinkButton>
            ) : null}
            <AccountRowActions id={a.id} active={a.active} isDefault={a.isDefault} canManage={canContas} />
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="Contas e caixas"
        description="Cadastre as contas da loja — toda baixa de pagamento/recebimento passa por uma delas"
      />

      {/* data-no-pdf: fora do PDF "Contas e caixas", que traz só o saldo das contas. */}
      <div data-no-pdf>
        <CashboxCard open={cashbox.open} session={cashbox.session} history={cashboxHistory} canManage={canContas} />
        <BooksHealthChecks health={health} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 print:hidden">
        <LinkButton href="/financeiro/livro-caixa" variant="secondary" className="justify-center">
          📒 Movimento de caixa diário
        </LinkButton>
        <LinkButton href="/financeiro/a-pagar" variant="secondary" className="justify-center">
          📤 Contas a pagar
        </LinkButton>
        <LinkButton href="/financeiro/a-receber" variant="secondary" className="justify-center">
          📥 Contas a receber
        </LinkButton>
      </div>

      <ReportToolbar basePath="/financeiro/contas" printTitle="Contas e caixas" q={q} placeholder="Buscar conta (nome, banco, saldo...)" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Saldo total"
          value={formatCurrency(totalBalance)}
          tone={totalBalance >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Contas ativas" value={String(active.length)} />
        <StatCard
          label="Conta padrão"
          value={active.find((a) => a.isDefault)?.name ?? "—"}
          hint="recebe as baixas quando nenhuma conta é escolhida"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {accountRows.length === 0 ? (
            <Card>
              <EmptyState
                title={q ? "Nenhuma conta encontrada" : "Nenhuma conta cadastrada"}
                description={
                  q
                    ? "Tente outros termos ou limpe a busca."
                    : "Cadastre ao lado o caixa da loja e as contas bancárias. A primeira vira a conta padrão."
                }
              />
            </Card>
          ) : (
            accountRows.map((a) => renderAccountCard(a))
          )}

          {/* data-no-pdf: transferências não entram no PDF de saldo das contas. */}
          <div data-no-pdf>
            <Card>
              <CardHeader title="Transferências entre contas" description="Últimas 20" />
              {transfers.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">Nenhuma transferência registrada.</p>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Data</Th>
                      <Th>De</Th>
                      <Th>Para</Th>
                      <Th>Descrição</Th>
                      <Th className="text-right">Valor</Th>
                      <Th />
                    </Tr>
                  </Thead>
                  <tbody>
                    {transfers.map((t) => (
                      <Tr key={t.id}>
                        <Td className="whitespace-nowrap">{formatDate(t.date)}</Td>
                        <Td>{t.from.name}</Td>
                        <Td>{t.to.name}</Td>
                        <Td>{t.description || "—"}</Td>
                        <Td className="text-right tabular-nums">{formatCurrency(t.amount)}</Td>
                        <Td>
                          {canContas ? <DeleteTransferButton id={t.id} /> : null}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </div>

        {canContas ? (
          <div className="space-y-4 print:hidden">
            <Card>
              <CardHeader title="Nova conta" />
              <div className="p-5">
                <AccountForm beneficiaries={beneficiaries} />
              </div>
            </Card>
            {active.filter((a) => !a.isInvestment).length >= 2 ? (
              <Card>
                <CardHeader title="Transferir entre contas" />
                <div className="p-5">
                  <TransferForm
                    accounts={active.filter((a) => !a.isInvestment).map((a) => ({ id: a.id, name: a.name }))}
                    cashboxDate={cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : null}
                  />
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
