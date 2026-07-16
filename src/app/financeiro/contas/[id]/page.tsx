import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import AccountFinancerSettings from "./AccountFinancerSettings";

export const dynamic = "force-dynamic";

const typeLabel = { CAIXA: "Caixa físico", BANCO: "Banco", POUPANCA: "Poupança", FINANCEIRA: "Financeira", OUTRO: "Outro" } as const;

export default async function AccountStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [account, balances, paid, received, transfers] = await Promise.all([
    prisma.financialAccount.findUnique({ where: { id } }),
    getAccountsWithBalances(),
    prisma.payable.findMany({
      where: { accountId: id, status: "PAGO" },
      include: { supplier: { select: { name: true } } },
    }),
    prisma.receivable.findMany({
      where: { accountId: id, status: "RECEBIDO" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.accountTransfer.findMany({
      where: { OR: [{ fromId: id }, { toId: id }] },
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
    }),
  ]);

  if (!account) notFound();

  const bal = balances.find((b) => b.id === id);

  type Mov = { id: string; date: Date; description: string; who: string; kind: "entrada" | "saida"; amount: number };
  const movements: Mov[] = [
    ...received.map((r) => ({
      id: `r-${r.id}`,
      date: r.receivedDate ?? r.dueDate,
      description: r.description,
      who: r.customer?.name || "-",
      kind: "entrada" as const,
      amount: r.amount,
    })),
    ...paid.map((p) => ({
      id: `p-${p.id}`,
      date: p.paymentDate ?? p.dueDate,
      description: p.description,
      who: p.supplier?.name || "-",
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
  const rows = movements.map((m) => {
    running += m.kind === "entrada" ? m.amount : -m.amount;
    return { ...m, balance: running };
  });
  rows.reverse(); // mais recente primeiro

  const totalIn = movements.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0);
  const totalOut = movements.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0);

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
          <LinkButton href="/financeiro/contas" variant="secondary">
            ← Contas
          </LinkButton>
        }
      />

      {account.type === "FINANCEIRA" ? (
        <AccountFinancerSettings id={account.id} initialPercent={account.returnTaxPercent} />
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Saldo atual" value={formatCurrency(bal?.balance ?? account.initialBalance)} tone={(bal?.balance ?? 0) >= 0 ? "positive" : "negative"} />
        <StatCard label="Saldo inicial" value={formatCurrency(account.initialBalance)} />
        <StatCard label="Entradas" value={formatCurrency(totalIn)} tone="positive" />
        <StatCard label="Saídas" value={formatCurrency(totalOut)} tone="negative" />
      </div>

      <Card>
        <CardHeader title="Histórico de movimentações" description="Todas as entradas e saídas desta conta, da mais recente para a mais antiga" />
        {rows.length === 0 ? (
          <EmptyState title="Sem movimentações" description="Pagamentos, recebimentos e transferências desta conta aparecem aqui." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Quem</Th>
                <Th className="text-right">Entrada</Th>
                <Th className="text-right">Saída</Th>
                <Th className="text-right">Saldo</Th>
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
                  <Td className={`text-right font-medium tabular-nums ${m.balance >= 0 ? "text-slate-900" : "text-rose-600"}`}>
                    {formatCurrency(m.balance)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
