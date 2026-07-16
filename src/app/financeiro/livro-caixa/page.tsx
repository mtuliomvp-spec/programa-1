import { prisma } from "@/lib/prisma";
import { getBooksHealth } from "@/lib/books-health";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import BooksHealthChecks from "@/components/BooksHealthChecks";
import CashEntryForm from "./CashEntryForm";
import DeleteCashEntryButton from "./DeleteCashEntryButton";

export const dynamic = "force-dynamic";

function parseMonth(value: string | undefined): { year: number; month: number } {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]) - 1 };
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

export default async function LivroCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; conta?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.mes);
  const accountFilter = params.conta || "";
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1));
  const monthValue = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = monthStart.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const accountWhere = accountFilter ? { accountId: accountFilter } : {};

  const [paidBefore, receivedBefore, paidMonth, receivedMonth, accounts, transfers, suppliers, stockVehicles, customCategories, beneficiaries, customers, health] =
    await Promise.all([
      prisma.payable.aggregate({
        where: { status: "PAGO", paymentDate: { lt: monthStart }, ...accountWhere },
        _sum: { amount: true },
      }),
      prisma.receivable.aggregate({
        where: { status: "RECEBIDO", receivedDate: { lt: monthStart }, ...accountWhere },
        _sum: { amount: true },
      }),
      prisma.payable.findMany({
        where: { status: "PAGO", paymentDate: { gte: monthStart, lt: monthEnd }, ...accountWhere },
        include: { supplier: true, account: { select: { name: true } } },
      }),
      prisma.receivable.findMany({
        where: { status: "RECEBIDO", receivedDate: { gte: monthStart, lt: monthEnd }, ...accountWhere },
        include: { customer: true, account: { select: { name: true } } },
      }),
      prisma.financialAccount.findMany({
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true, initialBalance: true, active: true },
      }),
      prisma.accountTransfer.findMany({
        where: accountFilter
          ? { OR: [{ fromId: accountFilter }, { toId: accountFilter }] }
          : { id: "___nunca___" },
        include: { from: { select: { name: true } }, to: { select: { name: true } } },
      }),
      prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.vehicle.findMany({
        // Inclui vendidos (para lançar despesas pós-venda); em estoque primeiro.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: { id: true, brand: true, model: true, plate: true, status: true },
      }),
      prisma.launchCategory.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      prisma.capitalBeneficiary.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      getBooksHealth(),
    ]);

  const DEFAULT_CATEGORIES = ["Outros", "Despesa operacional", "Comissão", "Salário", "Combustível"];
  const categoryOptions = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...customCategories.map((c) => c.name)]),
  );
  const vehicleOptions = stockVehicles.map((v) => ({
    id: v.id,
    label: `${v.brand} ${v.model} · ${v.plate}${v.status === "VENDIDO" ? " (vendido)" : ""}`,
  }));

  // saldo inicial considera o saldo de abertura das contas e as
  // transferências anteriores ao mês (quando filtrado por conta)
  const initialFromAccounts = accountFilter
    ? accounts.find((a) => a.id === accountFilter)?.initialBalance ?? 0
    : accounts.reduce((s, a) => s + a.initialBalance, 0);
  const transfersBefore = transfers
    .filter((t) => t.date < monthStart)
    .reduce((s, t) => s + (t.toId === accountFilter ? t.amount : -t.amount), 0);
  const openingBalance =
    initialFromAccounts +
    (receivedBefore._sum.amount || 0) -
    (paidBefore._sum.amount || 0) +
    transfersBefore;

  type Movement = {
    id: string;
    date: Date;
    description: string;
    who: string;
    kind: "entrada" | "saida";
    amount: number;
    // preenchido só em lançamentos avulsos que podem ser excluídos daqui
    deletable?: { kind: "entrada" | "saida"; id: string };
  };

  const transferMovements: Movement[] = transfers
    .filter((t) => t.date >= monthStart && t.date < monthEnd)
    .map((t) => ({
      id: `t-${t.id}`,
      date: t.date,
      description: t.description || `Transferência ${t.from.name} → ${t.to.name}`,
      who: t.toId === accountFilter ? t.from.name : t.to.name,
      kind: (t.toId === accountFilter ? "entrada" : "saida") as "entrada" | "saida",
      amount: t.amount,
    }));

  const movements: Movement[] = [
    ...transferMovements,
    ...receivedMonth.map((r) => ({
      id: `r-${r.id}`,
      date: r.receivedDate!,
      description: r.description,
      who: r.customer?.name || "-",
      kind: "entrada" as const,
      amount: r.amount,
      deletable:
        !r.saleId && !r.partSaleId && !r.recurringId && r.installmentNumber == null
          ? ({ kind: "entrada", id: r.id } as const)
          : undefined,
    })),
    ...paidMonth.map((p) => ({
      id: `p-${p.id}`,
      date: p.paymentDate!,
      description: p.description,
      who: p.supplier?.name || "-",
      kind: "saida" as const,
      amount: p.amount,
      deletable:
        !p.vehicleId && !p.partId && !p.recurringId && !p.consortiumId && !p.employeeId
          ? ({ kind: "saida", id: p.id } as const)
          : undefined,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = openingBalance;
  const rows = movements.map((m) => {
    running += m.kind === "entrada" ? m.amount : -m.amount;
    return { ...m, balance: running };
  });

  const totalIn = movements.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0);
  const totalOut = movements.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0);

  const prevMonth = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const toParam = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title="Livro caixa"
        description={`Movimentações realizadas em ${monthLabel}`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <LinkButton
              variant="secondary"
              href={`/financeiro/livro-caixa?mes=${toParam(prevMonth)}${accountFilter ? `&conta=${accountFilter}` : ""}`}
            >
              ← Mês anterior
            </LinkButton>
            <LinkButton
              variant="secondary"
              href={`/financeiro/livro-caixa?mes=${toParam(nextMonth)}${accountFilter ? `&conta=${accountFilter}` : ""}`}
            >
              Mês seguinte →
            </LinkButton>
            <PrintButton />
          </div>
        }
      />

      {accounts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          <LinkButton
            variant={!accountFilter ? "primary" : "secondary"}
            href={`/financeiro/livro-caixa?mes=${monthValue}`}
          >
            Todas as contas
          </LinkButton>
          {accounts
            .filter((a) => a.active)
            .map((a) => (
              <LinkButton
                key={a.id}
                variant={accountFilter === a.id ? "primary" : "secondary"}
                href={`/financeiro/livro-caixa?mes=${monthValue}&conta=${a.id}`}
              >
                {a.name}
              </LinkButton>
            ))}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saldo inicial" value={formatCurrency(openingBalance)} hint={`antes de ${monthLabel}`} />
        <StatCard label="Entradas no mês" value={formatCurrency(totalIn)} tone="positive" />
        <StatCard label="Saídas no mês" value={formatCurrency(totalOut)} tone="negative" />
        <StatCard
          label="Saldo final"
          value={formatCurrency(openingBalance + totalIn - totalOut)}
          tone={openingBalance + totalIn - totalOut >= 0 ? "positive" : "negative"}
        />
      </div>

      <BooksHealthChecks health={health} />

      <div className="mb-4">
        {health.allOk ? (
          <CashEntryForm
            accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
            supplierNames={suppliers.map((s) => s.name)}
            vehicles={vehicleOptions}
            beneficiaries={beneficiaries}
            customers={customers}
            categories={categoryOptions}
            defaultDate={toDateInputValue(new Date())}
            preselectedAccountId={accountFilter || undefined}
          />
        ) : (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 print:hidden">
            🔒 Novos lançamentos bloqueados até os saldos convergirem (veja os checks acima).
          </div>
        )}
      </div>

      <Card>
        <CardHeader
          title={`Movimentações — ${monthValue}`}
          description="Somente o que foi efetivamente pago e recebido, em ordem cronológica, com saldo corrente"
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma movimentação neste mês"
            description="Pagamentos e recebimentos baixados aparecem aqui, dia a dia."
          />
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
              <Tr className="bg-slate-50">
                <Td className="text-slate-500">—</Td>
                <Td className="font-medium text-slate-700">Saldo inicial</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className="text-right font-semibold tabular-nums">{formatCurrency(openingBalance)}</Td>
              </Tr>
              {rows.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap">{formatDate(m.date)}</Td>
                  <Td className="font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      {m.description}
                      {m.deletable ? (
                        <DeleteCashEntryButton kind={m.deletable.kind} id={m.deletable.id} />
                      ) : null}
                    </span>
                  </Td>
                  <Td>{m.who}</Td>
                  <Td className="text-right tabular-nums text-emerald-600">
                    {m.kind === "entrada" ? formatCurrency(m.amount) : ""}
                  </Td>
                  <Td className="text-right tabular-nums text-rose-600">
                    {m.kind === "saida" ? formatCurrency(m.amount) : ""}
                  </Td>
                  <Td
                    className={`text-right font-medium tabular-nums ${
                      m.balance >= 0 ? "text-slate-900" : "text-rose-600"
                    }`}
                  >
                    {formatCurrency(m.balance)}
                  </Td>
                </Tr>
              ))}
              <Tr className="bg-slate-50 font-semibold">
                <Td className="text-slate-700">Total</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className="text-right tabular-nums text-emerald-600">{formatCurrency(totalIn)}</Td>
                <Td className="text-right tabular-nums text-rose-600">{formatCurrency(totalOut)}</Td>
                <Td className="text-right tabular-nums">
                  {formatCurrency(openingBalance + totalIn - totalOut)}
                </Td>
              </Tr>
            </tbody>
          </Table>
        )}
        <p className="px-5 py-3 text-xs text-slate-400">
          O saldo considera todo o histórico de pagamentos e recebimentos baixados no sistema.{" "}
          <Badge tone="info">Dica</Badge> use a Conciliação bancária para conferir com o extrato do banco.
        </p>
      </Card>
    </div>
  );
}
