import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import AccountForm from "./AccountForm";
import TransferForm from "./TransferForm";
import AccountRowActions from "./AccountRowActions";
import DeleteTransferButton from "./DeleteTransferButton";

export const dynamic = "force-dynamic";

const typeLabel = { CAIXA: "Caixa físico", BANCO: "Banco", POUPANCA: "Poupança", FINANCEIRA: "Financeira", OUTRO: "Outro" } as const;

export default async function ContasPage() {
  const [accounts, transfers] = await Promise.all([
    getAccountsWithBalances(),
    prisma.accountTransfer.findMany({
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const active = accounts.filter((a) => a.active);
  // A financeira é tratada como uma conta real: entra no saldo total como as
  // demais (o valor financiado fica nela até a financeira transferir).
  const totalBalance = active.reduce((s, a) => s + a.balance, 0);

  const renderAccountCard = (a: (typeof accounts)[number]) => (
    <Card key={a.id} className={`px-5 py-4 ${!a.active ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {a.type === "BANCO" ? "🏦" : a.type === "POUPANCA" ? "🐷" : a.type === "FINANCEIRA" ? "🏢" : "💵"} {a.name}
            <Badge tone="default">{typeLabel[a.type]}</Badge>
            {a.isDefault ? <Badge tone="info">Padrão</Badge> : null}
            {!a.active ? <Badge tone="danger">Inativa</Badge> : null}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {[a.bankName, a.agency && `ag. ${a.agency}`, a.accountNumber && `conta ${a.accountNumber}`]
              .filter(Boolean)
              .join(" · ") || "—"}
            {" · "}inicial {formatCurrency(a.initialBalance)} · entradas {formatCurrency(a.received + a.transfersIn)} · saídas {formatCurrency(a.paid + a.transfersOut)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Saldo</p>
            <p className={`text-lg font-bold ${a.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(a.balance)}
            </p>
          </div>
          <AccountRowActions id={a.id} active={a.active} isDefault={a.isDefault} />
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

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
          {accounts.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhuma conta cadastrada"
                description="Cadastre ao lado o caixa da loja e as contas bancárias. A primeira vira a conta padrão."
              />
            </Card>
          ) : (
            accounts.map((a) => renderAccountCard(a))
          )}

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
                        <DeleteTransferButton id={t.id} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Nova conta" />
            <div className="p-5">
              <AccountForm />
            </div>
          </Card>
          {active.length >= 2 ? (
            <Card>
              <CardHeader title="Transferir entre contas" />
              <div className="p-5">
                <TransferForm accounts={active.map((a) => ({ id: a.id, name: a.name }))} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
