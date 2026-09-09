import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances, ensureNeutralAccount, accountPickerName } from "@/lib/accounts";
import { getBooksHealth } from "@/lib/books-health";
import { getCashboxState } from "@/lib/cashbox";
import { formatCurrency, formatDate } from "@/lib/format";
import { maturityStatus, daysToMaturity } from "@/lib/status";
import { matchesSearch } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import BooksHealthChecks from "@/components/BooksHealthChecks";
import { userCan } from "@/lib/guards";
import CashboxCard from "./CashboxCard";
import PaymentQueueCard from "./PaymentQueueCard";
import FuturePaymentsCard from "./FuturePaymentsCard";
import AccountForm from "./AccountForm";
import TransferForm from "./TransferForm";
import AccountRowActions from "./AccountRowActions";
import DeleteTransferButton from "./DeleteTransferButton";

export const dynamic = "force-dynamic";

const typeLabel = { CAIXA: "Caixa físico", BANCO: "Banco", POUPANCA: "Poupança", FINANCEIRA: "Financeira", OUTRO: "Outro" } as const;

/**
 * Vencimento da aplicação no card. Sem esta linha o dinheiro podia vencer e
 * ficar parado sem render, sem nada na tela avisando.
 */
function MaturityLine({ maturity }: { maturity: Date | null }) {
  const status = maturityStatus(maturity);
  if (status === "sem-data") {
    return (
      <p className="mt-0.5 text-xs text-slate-400">
        Vencimento não informado — abra a conta e informe para o dinheiro não ficar parado.
      </p>
    );
  }
  if (status === "vencido") {
    return (
      <p className="mt-0.5 text-xs font-medium text-rose-600">
        ⚠ Aplicação venceu em {formatDate(maturity!)} — reaplique para voltar a render.
      </p>
    );
  }
  if (status === "proximo") {
    const dias = daysToMaturity(maturity!);
    return (
      <p className="mt-0.5 text-xs font-medium text-amber-700">
        ⏳ Vence em {formatDate(maturity!)}
        {dias === 0 ? " (hoje)" : dias === 1 ? " (amanhã)" : ` (em ${dias} dias)`}
      </p>
    );
  }
  return <p className="mt-0.5 text-xs text-slate-500">Rende até {formatDate(maturity!)}</p>;
}

export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  // Conta estrutural do sistema: existe desde a primeira visita a esta tela,
  // sem depender de alguém fazer uma operação interna primeiro.
  await ensureNeutralAccount();
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

  // Sinais/entradas antecipadas aguardando crédito cuja data de depósito já
  // chegou (<= data de trabalho do caixa aberto): viram um aviso para creditar.
  const pendingAdvancesRaw =
    cashbox.open && cashbox.session
      ? await prisma.receivable.findMany({
          where: {
            status: "PENDENTE",
            saleId: null,
            vehicleId: { not: null },
            category: "VENDA_VEICULO",
            dueDate: { lte: cashbox.session.workDate },
            // Só veículo ainda em estoque: o abatimento do sinal na venda usa
            // recebíveis já RECEBIDOS, então creditar depois de vendido ficaria
            // solto (sem casar com a venda). Fica pendente até ser tratado.
            vehicle: { status: { not: "VENDIDO" } },
          },
          include: {
            vehicle: { select: { brand: true, model: true, plate: true } },
            account: { select: { name: true } },
            customer: { select: { name: true } },
          },
          orderBy: { dueDate: "asc" },
        })
      : [];
  const pendingAdvances = pendingAdvancesRaw.map((r) => ({
    id: r.id,
    amount: r.amount,
    depositDate: r.dueDate,
    accountName: r.account?.name ?? null,
    vehicleLabel: r.vehicle
      ? `${r.vehicle.brand} ${r.vehicle.model} · ${r.vehicle.plate}`
      : null,
    customerName: r.customer?.name ?? null,
  }));

  const canContas = await userCan("financeiro", "contas");
  const canPagar = await userCan("financeiro", "pagar");
  // Fila de espera: pagamentos cujo comprovante já chegou e que esperavam o
  // movimento alcançar o dia. Com o caixa aberto neste dia, eles podem ser
  // confirmados aqui mesmo.
  const { pagamentosNaFila, pagamentosAdiante, debitosPrelancados } = await import(
    "@/lib/payment-queue"
  );
  const workDate = cashbox.open && cashbox.session ? cashbox.session.workDate : null;
  // Pagos em dias À FRENTE do movimento (pagou hoje, o caixa ainda está em
  // ontem): o dinheiro já saiu do banco, então a tela mostra o total por dia —
  // ele só não pode ser confirmado antes de o movimento chegar lá.
  // Quanto cada conta ainda vai perder para os pré-lançamentos: o saldo de hoje
  // é o do sistema, mas o banco já debitou. O card mostra os dois.
  const [fila, adiante, prelancado] = await Promise.all([
    pagamentosNaFila(workDate),
    pagamentosAdiante(workDate),
    debitosPrelancados(),
  ]);
  const active = accounts.filter((a) => a.active);
  // Transferir exige duas contas correntes ativas (aplicação movimenta pelo
  // "Aplicar" da própria conta). Vale para o formulário e para o atalho.
  // Transferência entre contas: fora as de Aplicação (movimentam pelo "Aplicar"
  // da própria conta). O Banco Neutro ENTRA na lista, sempre por último e
  // marcado como compensação: quando ele está fora de zero, a transferência é
  // justamente como se encerra o lançamento — o dinheiro sai da conta de
  // verdade que bancou aquilo e entra nele. O servidor só aceita na direção que
  // o aproxima de zero.
  const transferiveis = active
    .filter((a) => !a.isInvestment)
    .sort((a, b) => Number(a.structural) - Number(b.structural));
  const neutro = accounts.find((a) => a.structural) ?? null;
  const podeTransferir = canContas && transferiveis.length >= 2;
  // A financeira é tratada como uma conta real: entra no saldo total como as
  // demais (o valor financiado fica nela até a financeira transferir).
  const totalBalance = active.reduce((s, a) => s + a.balance, 0);
  // Total pré-lançado: entra o que ainda não tem conta identificada — ele vai
  // sair de alguma conta, então pesa no total mesmo sem pesar em nenhum card.
  const totalPrelancado =
    Math.round(
      ([...prelancado.porConta.values()].reduce((s, v) => s + v, 0) + prelancado.semConta) * 100,
    ) / 100;
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
            {a.structural ? <Badge tone="warning">⚙️ Estrutural do sistema</Badge> : null}
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
          {a.isInvestment ? <MaturityLine maturity={a.investmentMaturity} /> : null}
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
            {/* Saldo previsto: o de hoje menos o que já saiu do banco e espera
                o ok do caixa. Discreto de propósito — o saldo que manda na
                contabilidade continua sendo o de cima. */}
            {(prelancado.porConta.get(a.id) ?? 0) > 0.005 ? (
              <p
                className="mt-0.5 text-[11px] leading-tight text-slate-500"
                title={`Já saiu do banco e espera o ok do caixa: ${formatCurrency(prelancado.porConta.get(a.id)!)}. O saldo acima só muda quando a baixa for confirmada.`}
              >
                −{formatCurrency(prelancado.porConta.get(a.id)!)} pré-lançado
                <span
                  className={`block font-semibold ${
                    a.balance - prelancado.porConta.get(a.id)! < 0 ? "text-rose-500" : "text-slate-600"
                  }`}
                >
                  previsto {formatCurrency(a.balance - prelancado.porConta.get(a.id)!)}
                </span>
              </p>
            ) : null}
          </div>
          {/* data-no-pdf: os botões de ação ficam fora do PDF de saldos. */}
          <div data-no-pdf className="flex items-center gap-4">
            {a.isInvestment && a.active && canContas ? (
              <LinkButton href={`/financeiro/contas/${a.id}`} className="whitespace-nowrap">
                📈 Aplicar
              </LinkButton>
            ) : null}
            <AccountRowActions
              id={a.id}
              active={a.active}
              isDefault={a.isDefault}
              structural={a.structural}
              canManage={canContas}
            />
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
        <CashboxCard
          open={cashbox.open}
          session={cashbox.session}
          history={cashboxHistory}
          canManage={canContas}
          pendingAdvances={pendingAdvances}
        />
        <BooksHealthChecks health={health} />
        <FuturePaymentsCard
          dias={adiante}
          workDateLabel={cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : ""}
        />
        <PaymentQueueCard
          rows={fila}
          accounts={accounts
            .filter((a) => a.active && !a.isInvestment)
            .map((a) => ({ id: a.id, name: a.name }))}
          workDateLabel={cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : ""}
          canPagar={canPagar}
        />
      </div>

      <div
        className={`mb-4 grid grid-cols-1 gap-2 print:hidden ${podeTransferir ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
      >
        <LinkButton href="/financeiro/livro-caixa" variant="secondary" className="justify-center">
          📒 Movimento de caixa diário
        </LinkButton>
        {/* O formulário de transferência fica nesta mesma página, lá embaixo:
            o atalho rola até ele em vez de abrir outra tela. */}
        {podeTransferir ? (
          <LinkButton href="#transferir" variant="secondary" className="justify-center">
            ↔️ Transferência entre contas
          </LinkButton>
        ) : null}
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
          hint={
            totalPrelancado > 0.005
              ? `previsto ${formatCurrency(totalBalance - totalPrelancado)} — ${formatCurrency(totalPrelancado)} já saíram do banco e esperam o ok do caixa`
              : undefined
          }
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
            {podeTransferir ? (
              <div id="transferir" className="scroll-mt-4">
                <Card>
                  <CardHeader title="Transferir entre contas" />
                  <div className="p-5">
                    <TransferForm
                      accounts={transferiveis.map((a) => ({
                        id: a.id,
                        name: accountPickerName(a.name, a.structural),
                      }))}
                      neutro={
                        neutro && Math.abs(neutro.balance) > 0.005
                          ? { id: neutro.id, balance: neutro.balance }
                          : null
                      }
                      cashboxDate={cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : null}
                    />
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
