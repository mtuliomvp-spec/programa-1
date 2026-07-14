import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FinanciamentosPage() {
  const [sales, accounts] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", paymentMethod: "FINANCIADO" },
      orderBy: { saleDate: "desc" },
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { brand: true, model: true, plate: true } },
        financerAccount: { select: { name: true } },
      },
    }),
    getAccountsWithBalances(),
  ]);

  const financers = accounts.filter((a) => a.type === "FINANCEIRA" && a.active);
  const totalAReceber = financers.reduce((s, a) => s + a.balance, 0);
  const totalFinanciado = sales.reduce((s, v) => s + (v.financedAmount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Financiamentos"
        description="Vendas financiadas: quem financiou, o veículo e o valor a receber da financeira"
        action={<LinkButton href="/financeiro/contas" variant="secondary">Contas das financeiras</LinkButton>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="A receber de financeiras"
          value={formatCurrency(totalAReceber)}
          hint="saldo parado nas contas das financeiras"
          tone={totalAReceber > 0 ? "warning" : "default"}
        />
        <StatCard label="Total financiado (histórico)" value={formatCurrency(totalFinanciado)} />
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
        O valor financiado fica na conta da financeira até ela pagar. Quando a financeira pagar,
        vá em <strong>Contas e caixas</strong> e faça uma <strong>transferência</strong> da conta da
        financeira para a conta da empresa — a conta da financeira zera e o dinheiro entra no caixa.
      </div>

      <Card>
        <CardHeader title="Vendas financiadas" />
        {sales.length === 0 ? (
          <EmptyState
            title="Nenhuma venda financiada"
            description="As vendas com forma de pagamento 'Financiado' aparecem aqui."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Financiado (cliente)</Th>
                <Th>Veículo</Th>
                <Th>Financeira</Th>
                <Th className="text-right">Valor financiado</Th>
              </Tr>
            </Thead>
            <tbody>
              {sales.map((s) => (
                <Tr key={s.id}>
                  <Td className="whitespace-nowrap">{formatDate(s.saleDate)}</Td>
                  <Td className="font-medium text-slate-900">{s.customer.name}</Td>
                  <Td>
                    {s.vehicle.brand} {s.vehicle.model} · {s.vehicle.plate}
                  </Td>
                  <Td>
                    {s.financerAccount?.name ? (
                      <Badge tone="info">{s.financerAccount.name}</Badge>
                    ) : (
                      <span className="text-slate-400">{s.financerName || "—"}</span>
                    )}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {formatCurrency(s.financedAmount ?? 0)}
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
