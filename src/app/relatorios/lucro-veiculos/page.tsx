import Link from "next/link";
import { getVehicleProfitReport } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function LucroVeiculosPage() {
  const rows = await getVehicleProfitReport();

  // Totais de lucro somam TODAS as operações (venda + financiamento de terceiros
  // + retorno). Contagem e margem consideram só as vendas próprias, para a margem
  // não ser distorcida pela intermediação (venda = sobra do financiamento).
  const ownSales = rows.filter((r) => !r.isIntermediation);
  const totalGross = rows.reduce((sum, r) => sum + r.profit, 0);
  const totalNet = rows.reduce((sum, r) => sum + r.netProfit, 0);
  const ownRevenue = ownSales.reduce((sum, r) => sum + r.saleAmount, 0);
  const ownNet = ownSales.reduce((sum, r) => sum + r.netProfit, 0);
  const avgMargin = ownRevenue > 0 ? (ownNet / ownRevenue) * 100 : 0;
  const avgDays =
    ownSales.length > 0
      ? Math.round(ownSales.reduce((sum, r) => sum + r.daysInStock, 0) / ownSales.length)
      : 0;

  return (
    <div>
      <PageHeader
        title="Lucro por veículo"
        description="Lucro da venda (bruto − comissões, indicações e transferência) e lucro do retorno (retorno recebido líquido do imposto − comissão do retorno). O lucro líquido é a soma dos dois. Inclui financiamento de terceiros."
        action={<PrintButton />}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Veículos vendidos" value={String(ownSales.length)} />
        <StatCard
          label="Lucro bruto total"
          value={formatCurrency(totalGross)}
          tone={totalGross >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Lucro líquido total"
          value={formatCurrency(totalNet)}
          tone={totalNet >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Margem média (líquida)"
          value={`${avgMargin.toFixed(1)}%`}
          tone={avgMargin >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Tempo médio até vender" value={`${avgDays} dias`} />
      </div>

      <Card>
        <CardHeader title="Vendas detalhadas" description="Ordenado da venda mais recente para a mais antiga" />
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma venda concluída ainda"
            description="Assim que você vender o primeiro veículo, o lucro real aparece aqui."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th>Data</Th>
                <Th className="text-right">Compra</Th>
                <Th className="text-right">Custos</Th>
                <Th className="text-right">Venda</Th>
                <Th className="text-right">Lucro bruto</Th>
                <Th className="text-right">Despesas da venda</Th>
                <Th className="text-right">Retorno</Th>
                <Th className="text-right">Lucro do retorno</Th>
                <Th className="text-right">Lucro líquido</Th>
                <Th className="text-right">Margem</Th>
                <Th className="text-right">Dias</Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.saleId}>
                  <Td className="font-medium text-slate-900">
                    <Link href={`/vendas/${r.saleId}`} className="hover:underline">
                      {r.vehicleLabel}
                    </Link>
                    <span className="ml-1.5 text-xs text-slate-400">{r.plate}</span>
                    {r.isIntermediation ? (
                      <span className="ml-1.5 inline-block rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 align-middle">
                        Financ. terceiros
                      </span>
                    ) : null}
                  </Td>
                  <Td>{formatDate(r.saleDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.purchasePrice)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.extraCosts)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.saleAmount)}</Td>
                  <Td
                    className={`text-right tabular-nums ${
                      r.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatCurrency(r.profit)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.saleExpenses > 0 ? `−${formatCurrency(r.saleExpenses)}` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-emerald-600">
                    {r.returnAmount > 0 ? `+${formatCurrency(r.returnAmount)}` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.returnAmount > 0 || r.returnCommission > 0 ? (
                      <>
                        <span
                          className={r.returnNetProfit >= 0 ? "text-emerald-600" : "text-rose-600"}
                        >
                          {r.returnNetProfit >= 0 ? "+" : "−"}
                          {formatCurrency(Math.abs(r.returnNetProfit))}
                        </span>
                        {r.returnCommission > 0 ? (
                          <span className="block text-[10px] text-slate-400">
                            − comissão {formatCurrency(r.returnCommission)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td
                    className={`text-right font-semibold tabular-nums ${
                      r.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatCurrency(r.netProfit)}
                  </Td>
                  <Td
                    className={`text-right tabular-nums ${
                      r.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {r.isIntermediation ? "—" : `${r.marginPct.toFixed(1)}%`}
                  </Td>
                  <Td className="text-right tabular-nums">{r.daysInStock}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
