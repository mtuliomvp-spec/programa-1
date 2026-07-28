import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances, getSelectableAccounts } from "@/lib/accounts";
import { appliedByBeneficiary, reconcileInvestmentAccount, totalApplied } from "@/lib/investments";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { matchesSearch, inValueRange, inDateRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, Input, LinkButton, PageHeader, Select, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { userCan } from "@/lib/guards";
import PrintButton from "@/components/PrintButton";
import AccountFinancerSettings from "./AccountFinancerSettings";
import InvestmentPanel from "./InvestmentPanel";

export const dynamic = "force-dynamic";

const typeLabel = { CAIXA: "Caixa físico", BANCO: "Banco", POUPANCA: "Poupança", FINANCEIRA: "Financeira", OUTRO: "Outro" } as const;

export default async function AccountStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; tipo?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const { id } = await params;
  const { q: qRaw, tipo, de, ate, min, max } = await searchParams;
  const q = (qRaw ?? "").trim();
  // Com qualquer filtro ativo, o saldo corrente deixa de fazer sentido (a lista
  // não é mais o histórico completo) — a coluna Saldo fica oculta.
  const tipoFilter = tipo === "ENTRADA" || tipo === "SAIDA" ? tipo : "";
  const filtering =
    Boolean(q) || Boolean(tipoFilter) || Boolean(de) || Boolean(ate) || Boolean(min?.trim()) || Boolean(max?.trim());

  const [account, balances, paid, received, transfers] = await Promise.all([
    prisma.financialAccount.findUnique({ where: { id } }),
    getAccountsWithBalances(),
    prisma.payable.findMany({
      where: { accountId: id, status: "PAGO" },
      include: { supplier: { select: { name: true } }, capitalBeneficiary: { select: { name: true } } },
    }),
    prisma.receivable.findMany({
      where: { accountId: id, status: "RECEBIDO" },
      include: { customer: { select: { name: true } }, capitalBeneficiary: { select: { name: true } } },
    }),
    prisma.accountTransfer.findMany({
      where: { OR: [{ fromId: id }, { toId: id }] },
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
    }),
  ]);

  if (!account) notFound();

  const canContas = await userCan("financeiro", "contas");
  const bal = balances.find((b) => b.id === id);

  // Conta de Aplicação: mostra a razão do capital por sócio + operações.
  if (account.isInvestment) {
    const [applied, recon, beneficiaries, sourceAccounts] = await Promise.all([
      appliedByBeneficiary(id),
      reconcileInvestmentAccount(id),
      prisma.capitalBeneficiary.findMany({
        where: { active: true },
        orderBy: [{ isCompany: "desc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      getSelectableAccounts(),
    ]);
    const allocated = await totalApplied(id);
    return (
      <div>
        <PageHeader
          title={account.name}
          description="Conta de Aplicação — investimento dos sócios"
          action={
            <LinkButton href="/financeiro/contas" variant="secondary">
              ← Contas
            </LinkButton>
          }
        />
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Saldo aplicado" value={formatCurrency(recon.balance)} tone="positive" />
          <StatCard label="Sócios com dinheiro aqui" value={String(applied.length)} />
        </div>
        <InvestmentPanel
          accountId={id}
          balance={recon.balance}
          allocated={allocated}
          reconciled={recon.ok}
          applied={applied}
          beneficiaries={beneficiaries}
          sourceAccounts={sourceAccounts}
          canManage={canContas}
          today={toDateInputValue(new Date())}
        />
      </div>
    );
  }

  type Mov = { id: string; date: Date; description: string; who: string; kind: "entrada" | "saida"; amount: number };
  const movements: Mov[] = [
    ...received.map((r) => ({
      id: `r-${r.id}`,
      date: r.receivedDate ?? r.dueDate,
      description: r.description,
      who: r.customer?.name || r.capitalBeneficiary?.name || "-",
      kind: "entrada" as const,
      amount: r.amount,
    })),
    ...paid.map((p) => ({
      id: `p-${p.id}`,
      date: p.paymentDate ?? p.dueDate,
      description: p.description,
      who: p.supplier?.name || p.capitalBeneficiary?.name || "-",
      kind: "saida" as const,
      amount: p.amount,
    })),
    ...transfers.map((t) => {
      const isIn = t.toId === id;
      return {
        id: `t-${t.id}`,
        date: t.date,
        description: t.description || `Transferência ${t.from.name} → ${t.to.name}`,
        who: isIn ? t.from.name : t.to.name,
        kind: (isIn ? "entrada" : "saida") as "entrada" | "saida",
        amount: t.amount,
      };
    }),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // saldo corrente a partir do saldo inicial
  let running = account.initialBalance;
  const allRows = movements.map((m) => {
    running += m.kind === "entrada" ? m.amount : -m.amount;
    return { ...m, balance: running };
  });
  allRows.reverse(); // mais recente primeiro

  // Busca + filtros (tipo, data, faixa de valor) sobre os campos exibidos.
  // Com filtro ativo, a coluna Saldo fica oculta (só vale no histórico completo).
  const rows = filtering
    ? allRows.filter(
        (m) =>
          matchesSearch(q, formatDate(m.date), m.description, m.who, m.amount, formatCurrency(m.amount)) &&
          inDateRange(m.date, de, ate) &&
          inValueRange(m.amount, min, max) &&
          (!tipoFilter || (tipoFilter === "ENTRADA" ? m.kind === "entrada" : m.kind === "saida")),
      )
    : allRows;

  const totalIn = movements.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0);
  const totalOut = movements.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0);
  const filtIn = rows.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0);
  const filtOut = rows.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0);

  return (
    <div>
      <PageHeader
        title={account.name}
        description={`${typeLabel[account.type]}${
          [account.bankName, account.agency && `ag. ${account.agency}`, account.accountNumber && `conta ${account.accountNumber}`]
            .filter(Boolean)
            .join(" · ")
            ? " · " +
              [account.bankName, account.agency && `ag. ${account.agency}`, account.accountNumber && `conta ${account.accountNumber}`]
                .filter(Boolean)
                .join(" · ")
            : ""
        }`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <LinkButton href="/financeiro/contas" variant="secondary">
              ← Contas
            </LinkButton>
            <PrintButton title={`Conta ${account.name}`} />
          </div>
        }
      />

      {account.type === "FINANCEIRA" && canContas ? (
        <AccountFinancerSettings
          id={account.id}
          initialPercent={account.returnTaxPercent}
          initialSellerPercent={account.sellerReturnPercent}
        />
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Saldo atual" value={formatCurrency(bal?.balance ?? account.initialBalance)} tone={(bal?.balance ?? 0) >= 0 ? "positive" : "negative"} />
        <StatCard label="Saldo inicial" value={formatCurrency(account.initialBalance)} />
        <StatCard label="Entradas" value={formatCurrency(totalIn)} tone="positive" />
        <StatCard label="Saídas" value={formatCurrency(totalOut)} tone="negative" />
      </div>

      <Card>
        <CardHeader title="Histórico de movimentações" description="Todas as entradas e saídas desta conta, da mais recente para a mais antiga" />
        {movements.length > 0 ? (
          <form className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-5 py-3 print:hidden">
            <div className="min-w-[200px] flex-1">
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                Buscar
                <Input name="q" defaultValue={q} placeholder="Descrição, quem, valor..." className="mt-0.5" />
              </label>
            </div>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Tipo
              <Select name="tipo" defaultValue={tipoFilter || "TODOS"} className="mt-0.5 w-36">
                <option value="TODOS">Todas</option>
                <option value="ENTRADA">Entradas</option>
                <option value="SAIDA">Saídas</option>
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              De
              <Input type="date" name="de" defaultValue={de} className="mt-0.5 w-40" />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Até
              <Input type="date" name="ate" defaultValue={ate} className="mt-0.5 w-40" />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Valor mín.
              <Input name="min" inputMode="decimal" defaultValue={min} placeholder="0,00" className="mt-0.5 w-28" />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Valor máx.
              <Input name="max" inputMode="decimal" defaultValue={max} placeholder="—" className="mt-0.5 w-28" />
            </label>
            <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Filtrar
            </button>
            {filtering ? (
              <LinkButton variant="secondary" href={`/financeiro/contas/${id}`}>
                Limpar
              </LinkButton>
            ) : null}
          </form>
        ) : null}
        {movements.length === 0 ? (
          <EmptyState title="Sem movimentações" description="Pagamentos, recebimentos e transferências desta conta aparecem aqui." />
        ) : rows.length === 0 ? (
          <EmptyState title="Nada encontrado para o filtro" description="Tente outros termos ou limpe o filtro." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Quem</Th>
                <Th className="text-right">Entrada</Th>
                <Th className="text-right">Saída</Th>
                {!filtering ? <Th className="text-right">Saldo</Th> : null}
              </Tr>
            </Thead>
            <tbody>
              {rows.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap">{formatDate(m.date)}</Td>
                  <Td className="font-medium text-slate-900">
                    {m.description}
                    {m.id.startsWith("t-") ? <Badge tone="default">Transferência</Badge> : null}
                  </Td>
                  <Td>{m.who}</Td>
                  <Td className="text-right tabular-nums text-emerald-600">
                    {m.kind === "entrada" ? formatCurrency(m.amount) : ""}
                  </Td>
                  <Td className="text-right tabular-nums text-rose-600">
                    {m.kind === "saida" ? formatCurrency(m.amount) : ""}
                  </Td>
                  {!filtering ? (
                    <Td className={`text-right font-medium tabular-nums ${m.balance >= 0 ? "text-slate-900" : "text-rose-600"}`}>
                      {formatCurrency(m.balance)}
                    </Td>
                  ) : null}
                </Tr>
              ))}
              {filtering ? (
                <Tr className="bg-slate-50 font-semibold">
                  <Td className="text-slate-700">Total do filtro</Td>
                  <Td>{""}</Td>
                  <Td>{""}</Td>
                  <Td className="text-right tabular-nums text-emerald-600">{formatCurrency(filtIn)}</Td>
                  <Td className="text-right tabular-nums text-rose-600">{formatCurrency(filtOut)}</Td>
                </Tr>
              ) : null}
            </tbody>
          </Table>
        )}
        {filtering ? (
          <p className="px-5 py-2 text-xs text-slate-500">
            O filtro vale só para esta lista. Os cartões acima (saldo, entradas e saídas) seguem
            considerando a conta inteira.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
