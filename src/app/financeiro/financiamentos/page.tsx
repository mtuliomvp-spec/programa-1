import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { retornoLabel } from "@/lib/retorno";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import FinancingSettleButton from "./FinancingSettleButton";

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
  // Contas da empresa (não-financeira) que podem receber o repasse.
  const companyAccounts = accounts
    .filter((a) => a.active && a.type !== "FINANCEIRA")
    .map((a) => ({ id: a.id, name: a.name }));

  return (
    <div>
      <PageHeader
        title="Financiamentos"
        description="Vendas financiadas: quem financiou, o veículo e o valor a receber da financeira"
        action={<LinkButton href="/financeiro/contas" variant="secondary">Contas das financeiras</LinkButton>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Saldo nas financeiras"
          value={formatCurrency(totalAReceber)}
          hint="valor financiado ainda na conta das financeiras"
          tone={totalAReceber > 0 ? "warning" : "default"}
        />
        <StatCard label="Total financiado (histórico)" value={formatCurrency(totalFinanciado)} />
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
        O valor financiado fica na conta da financeira. Quando a financeira pagar, clique em{" "}
        <strong>Receber (dar baixa)</strong> na linha do financiamento e escolha a conta da empresa —
        o valor sai da financeira e entra no caixa automaticamente.
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
                <Th className="text-right">Situação</Th>
                <Th className="text-right">Retorno</Th>
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
                  <Td className="text-right">
                    {s.financerSettledAt ? (
                      <Badge tone="success">Recebido {formatDate(s.financerSettledAt)}</Badge>
                    ) : s.financerAccountId ? (
                      <FinancingSettleButton saleId={s.id} accounts={companyAccounts} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {s.returnLevel > 0 && s.returnNet > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-slate-500">
                          {retornoLabel(s.returnLevel)} · {formatCurrency(s.returnNet)}
                        </span>
                        {s.returnSettledAt ? (
                          <Badge tone="success">Recebido {formatDate(s.returnSettledAt)}</Badge>
                        ) : s.financerAccountId ? (
                          <FinancingSettleButton
                            saleId={s.id}
                            accounts={companyAccounts}
                            mode="return"
                            label="Receber retorno"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
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
