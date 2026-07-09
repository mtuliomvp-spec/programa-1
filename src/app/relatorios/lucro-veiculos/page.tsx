import Link from "next/link";
import { getVehicleProfitReport } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function LucroVeiculosPage() {
  const rows = await getVehicleProfitReport();

  const totalProfit = rows.reduce((sum, r) => sum + r.profit, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.saleAmount, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const avgDays =
    rows.length > 0 ? Math.round(rows.reduce((sum, r) => sum + r.daysInStock, 0) / rows.length) : 0;

  return (
    <div>
      <PageHeader
        title="Lucro por veículo"
        description="Resultado real de cada venda: compra + custos lançados vs. valor vendido"
        action={<PrintButton />}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Veículos vendidos" value={String(rows.length)} />
        <StatCard
          label="Lucro total"
          value={formatCurrency(totalProfit)}
          tone={totalProfit >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Margem média"
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
                <Th className="text-right">Lucro</Th>
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
                  </Td>
                  <Td>{formatDate(r.saleDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.purchasePrice)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.extraCosts)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.saleAmount)}</Td>
                  <Td
                    className={`text-right font-semibold tabular-nums ${
                      r.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatCurrency(r.profit)}
                  </Td>
                  <Td
                    className={`text-right tabular-nums ${
                      r.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {r.marginPct.toFixed(1)}%
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
