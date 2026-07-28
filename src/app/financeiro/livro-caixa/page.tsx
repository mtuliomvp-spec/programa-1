import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getBooksHealth } from "@/lib/books-health";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { matchesSearch, inValueRange, inDateRange } from "@/lib/search";
import { getCashboxState } from "@/lib/cashbox";
import { userCan } from "@/lib/guards";
import { getClosedMonths, monthLabelBR } from "@/lib/monthly-closing";
import { capitalStatusByBeneficiary } from "@/lib/investments";
import { Badge, Card, CardHeader, EmptyState, Input, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
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
  searchParams: Promise<{ mes?: string; conta?: string; q?: string; min?: string; max?: string; de?: string; ate?: string; ver?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.mes);
  const accountFilter = params.conta || "";
  const q = (params.q || "").trim();
  const { min, max, de, ate } = params;
  // ?ver=1 revela o extrato completo de um mês fechado (lançamentos + saldo
  // transportado + saldo corrente) — é o que o botão do mês fechado faz.
  const reveal = params.ver === "1";
  // Com qualquer filtro ativo (texto, valor ou período) o saldo corrente não
  // faz sentido — a coluna Saldo fica oculta.
  const filtering =
    Boolean(q) || Boolean(min?.trim()) || Boolean(max?.trim()) || Boolean(de) || Boolean(ate);
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1));
  const monthValue = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = monthStart.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const accountWhere = accountFilter ? { accountId: accountFilter } : {};

  // Data de trabalho do caixa aberto: novos lançamentos ficam travados nela.
  const cashbox = await getCashboxState();
  const cashboxWorkDate = cashbox.open ? cashbox.session?.workDate ?? null : null;
  const canCriar = await userCan("financeiro", "criar");

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
        include: {
          supplier: true,
          account: { select: { name: true } },
          vehicle: { select: { brand: true, model: true, plate: true } },
        },
      }),
      prisma.receivable.findMany({
        where: { status: "RECEBIDO", receivedDate: { gte: monthStart, lt: monthEnd }, ...accountWhere },
        include: {
          customer: true,
          account: { select: { name: true } },
          vehicle: { select: { brand: true, model: true, plate: true } },
        },
      }),
      prisma.financialAccount.findMany({
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true, initialBalance: true, active: true, isInvestment: true },
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

  // Status de capital (aplicado/livre) por sócio, para avisar quando um saque
  // de capital passar do capital livre (parte está aplicada).
  const capitalStatus = await capitalStatusByBeneficiary();
  const beneficiariesWithStatus = beneficiaries.map((b) => {
    const s = capitalStatus.get(b.id);
    return { id: b.id, name: b.name, applied: s?.applied ?? 0, free: s?.free ?? 0 };
  });

  // Mês encerrado: seus lançamentos ficam ocultos (só via busca); a lista de
  // meses fechados vira atalhos para consultar cada um.
  const closings = await getClosedMonths();
  const monthClosed = closings.some((c) => c.year === year && c.month === month + 1);
  // Oculta só por padrão; a busca ou o botão "Ver lançamentos" (ver=1) revela.
  const hideEntries = monthClosed && !filtering && !reveal;

  const DEFAULT_CATEGORIES = ["Outros", "Despesa operacional", "Comissão", "Salário", "Combustível", "Tráfego pago"];
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
    notes: string | null;
    who: string;
    vehicle: string | null;
    kind: "entrada" | "saida";
    amount: number;
    // link para a ordem de pagamento (saídas com conta a pagar)
    href?: string;
    // preenchido só em lançamentos avulsos que podem ser excluídos daqui
    deletable?: { kind: "entrada" | "saida"; id: string };
  };

  const vehicleLabel = (v: { brand: string; model: string; plate: string } | null) =>
    v ? `${v.brand} ${v.model} · ${v.plate}` : null;

  const transferMovements: Movement[] = transfers
    .filter((t) => t.date >= monthStart && t.date < monthEnd)
    .map((t) => ({
      id: `t-${t.id}`,
      date: t.date,
      description: t.description || `Transferência ${t.from.name} → ${t.to.name}`,
      notes: null,
      who: t.toId === accountFilter ? t.from.name : t.to.name,
      vehicle: null,
      kind: (t.toId === accountFilter ? "entrada" : "saida") as "entrada" | "saida",
      amount: t.amount,
    }));

  const movements: Movement[] = [
    ...transferMovements,
    ...receivedMonth.map((r) => ({
      id: `r-${r.id}`,
      date: r.receivedDate!,
      description: r.description,
      notes: r.notes,
      who: r.customer?.name || "-",
      vehicle: vehicleLabel(r.vehicle),
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
      notes: p.notes,
      who: p.supplier?.name || "-",
      vehicle: vehicleLabel(p.vehicle),
      kind: "saida" as const,
      amount: p.amount,
      href: `/financeiro/a-pagar/${p.id}/ordem`,
      deletable:
        !p.vehicleId && !p.partId && !p.recurringId && !p.consortiumId && !p.employeeId
          ? ({ kind: "saida", id: p.id } as const)
          : undefined,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = openingBalance;
  const allRows = movements.map((m) => {
    running += m.kind === "entrada" ? m.amount : -m.amount;
    return { ...m, balance: running };
  });
  // Busca + faixa de valor: filtra pelas colunas exibidas. O saldo corrente só
  // faz sentido com o mês completo, então a coluna Saldo fica oculta com filtro.
  const rows = filtering
    ? allRows.filter(
        (m) =>
          matchesSearch(
            q,
            formatDate(m.date),
            m.description,
            m.notes,
            m.who,
            m.vehicle,
            m.amount,
            formatCurrency(m.amount),
            m.kind,
          ) &&
          inValueRange(m.amount, min, max) &&
          inDateRange(m.date, de, ate),
      )
    : allRows;

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
            href={`/financeiro/livro-caixa?mes=${monthValue}${reveal ? "&ver=1" : ""}`}
          >
            Todas as contas
          </LinkButton>
          {accounts
            .filter((a) => a.active)
            .map((a) => (
              <LinkButton
                key={a.id}
                variant={accountFilter === a.id ? "primary" : "secondary"}
                href={`/financeiro/livro-caixa?mes=${monthValue}&conta=${a.id}${reveal ? "&ver=1" : ""}`}
              >
                {a.name}
              </LinkButton>
            ))}
        </div>
      ) : null}

      {closings.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meses fechados:</span>
          {closings.map((c) => {
            const key = `${c.year}-${String(c.month).padStart(2, "0")}`;
            return (
              <LinkButton
                key={c.id}
                variant={monthValue === key ? "primary" : "secondary"}
                href={`/financeiro/livro-caixa?mes=${key}&ver=1${accountFilter ? `&conta=${accountFilter}` : ""}`}
              >
                {monthLabelBR(c.year, c.month)}
              </LinkButton>
            );
          })}
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

      <div className={`mb-4 ${canCriar ? "" : "hidden"}`}>
        {health.allOk ? (
          <CashEntryForm
            accounts={accounts.filter((a) => a.active && !a.isInvestment).map((a) => ({ id: a.id, name: a.name }))}
            supplierNames={suppliers.map((s) => s.name)}
            vehicles={vehicleOptions}
            beneficiaries={beneficiariesWithStatus}
            customers={customers}
            categories={categoryOptions}
            defaultDate={toDateInputValue(cashboxWorkDate ?? new Date())}
            lockedDate={!!cashboxWorkDate}
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
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-5 py-3 print:hidden">
          <input type="hidden" name="mes" value={monthValue} />
          {accountFilter ? <input type="hidden" name="conta" value={accountFilter} /> : null}
          {reveal ? <input type="hidden" name="ver" value="1" /> : null}
          <div className="min-w-[200px] flex-1">
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Buscar
              <Input name="q" defaultValue={q} placeholder="Descrição, quem, veículo, valor..." className="mt-0.5" />
            </label>
          </div>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            De
            <Input
              type="date"
              name="de"
              defaultValue={de}
              min={toDateInputValue(monthStart)}
              max={toDateInputValue(new Date(Date.UTC(year, month + 1, 0)))}
              className="mt-0.5 w-40"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Até
            <Input
              type="date"
              name="ate"
              defaultValue={ate}
              min={toDateInputValue(monthStart)}
              max={toDateInputValue(new Date(Date.UTC(year, month + 1, 0)))}
              className="mt-0.5 w-40"
            />
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
            <LinkButton variant="secondary" href={`/financeiro/livro-caixa?mes=${monthValue}${reveal ? "&ver=1" : ""}${accountFilter ? `&conta=${accountFilter}` : ""}`}>
              Limpar
            </LinkButton>
          ) : null}
        </form>
        {hideEntries ? (
          <div className="px-5 py-8 text-center text-sm text-slate-600">
            🔒 <strong>Mês encerrado.</strong> Os lançamentos ficam ocultos por padrão. Clique abaixo
            para ver o extrato completo (com saldo transportado e saldo corrente) ou use a busca acima.
            <div className="mt-3">
              <LinkButton
                variant="primary"
                href={`/financeiro/livro-caixa?mes=${monthValue}&ver=1${accountFilter ? `&conta=${accountFilter}` : ""}`}
              >
                Ver lançamentos deste mês
              </LinkButton>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhuma movimentação neste mês"}
            description={
              q
                ? "Tente outros termos ou limpe a busca."
                : "Pagamentos e recebimentos baixados aparecem aqui, dia a dia."
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Quem</Th>
                <Th>Veículo</Th>
                <Th className="text-right">Entrada</Th>
                <Th className="text-right">Saída</Th>
                {!filtering ? <Th className="text-right">Saldo</Th> : null}
              </Tr>
            </Thead>
            <tbody>
              {!filtering ? (
                <Tr className="bg-slate-50">
                  <Td className="text-slate-500">—</Td>
                  <Td className="font-medium text-slate-700">Saldo inicial</Td>
                  <Td>{""}</Td>
                  <Td>{""}</Td>
                  <Td>{""}</Td>
                  <Td>{""}</Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {openingBalance < 0 ? (
                      <span className="text-rose-600">{formatCurrency(openingBalance)}</span>
                    ) : (
                      formatCurrency(openingBalance)
                    )}
                  </Td>
                </Tr>
              ) : null}
              {rows.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap">{formatDate(m.date)}</Td>
                  <Td className="font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      {m.href ? (
                        <Link href={m.href} className="text-blue-700 hover:underline" title="Abrir ordem de pagamento">
                          {m.description}
                        </Link>
                      ) : (
                        m.description
                      )}
                      {m.deletable && canCriar ? (
                        <DeleteCashEntryButton kind={m.deletable.kind} id={m.deletable.id} />
                      ) : null}
                    </span>
                    {m.notes ? (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">{m.notes}</span>
                    ) : null}
                  </Td>
                  <Td>{m.who}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{m.vehicle || "-"}</Td>
                  <Td className="text-right tabular-nums text-emerald-600">
                    {m.kind === "entrada" ? formatCurrency(m.amount) : ""}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {m.kind === "saida" ? (
                      <span className="text-rose-600">{formatCurrency(m.amount)}</span>
                    ) : (
                      ""
                    )}
                  </Td>
                  {!filtering ? (
                    <Td className="text-right font-medium tabular-nums">
                      {m.balance < 0 ? (
                        <span className="text-rose-600">{formatCurrency(m.balance)}</span>
                      ) : (
                        formatCurrency(m.balance)
                      )}
                    </Td>
                  ) : null}
                </Tr>
              ))}
              <Tr className="bg-slate-50 font-semibold">
                <Td className="text-slate-700">{filtering ? "Total da busca" : "Total"}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className="text-right tabular-nums text-emerald-600">
                  {formatCurrency(rows.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0))}
                </Td>
                <Td className="text-right tabular-nums">
                  <span className="text-rose-600">
                    {formatCurrency(rows.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0))}
                  </span>
                </Td>
                {!filtering ? (
                  <Td className="text-right tabular-nums">
                    {openingBalance + totalIn - totalOut < 0 ? (
                      <span className="text-rose-600">{formatCurrency(openingBalance + totalIn - totalOut)}</span>
                    ) : (
                      formatCurrency(openingBalance + totalIn - totalOut)
                    )}
                  </Td>
                ) : null}
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
