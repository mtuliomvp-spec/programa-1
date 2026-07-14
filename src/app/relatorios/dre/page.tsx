import { getMonthlyDre } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ProfitBarChart from "@/components/ProfitBarChart";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const params = await searchParams;
  const months = params.meses === "6" ? 6 : 12;
  const dre = await getMonthlyDre(months);

  const totals = dre.reduce(
    (acc, m) => ({
      receitaTotal: acc.receitaTotal + m.receitaTotal,
      custoTotal: acc.custoTotal + m.custoTotal,
      lucroBruto: acc.lucroBruto + m.lucroBruto,
      despesas: acc.despesas + m.despesas,
      comissoes: acc.comissoes + m.comissoes,
      lucroLiquido: acc.lucroLiquido + m.lucroLiquido,
      veiculosVendidos: acc.veiculosVendidos + m.veiculosVendidos,
    }),
    { receitaTotal: 0, custoTotal: 0, lucroBruto: 0, despesas: 0, comissoes: 0, lucroLiquido: 0, veiculosVendidos: 0 },
  );

  return (
    <div>
      <PageHeader
        title="DRE mensal"
        description={`Resultado dos últimos ${months} meses (regime de caixa — despesas quando pagas)`}
        action={
          <div className="flex gap-2 print:hidden">
            <LinkButton href="/relatorios/dre?meses=6" variant={months === 6 ? "primary" : "secondary"}>
              6 meses
            </LinkButton>
            <LinkButton href="/relatorios/dre?meses=12" variant={months === 12 ? "primary" : "secondary"}>
              12 meses
            </LinkButton>
            <PrintButton />
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader title="Lucro líquido por mês" />
        <div className="p-5">
          <ProfitBarChart data={dre.map((m) => ({ label: m.label, lucroLiquido: m.lucroLiquido }))} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Demonstrativo detalhado"
          description="Receita de veículos e peças, custo do que foi vendido, despesas e comissões"
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Mês</Th>
              <Th className="text-right">Vendas</Th>
              <Th className="text-right">Receita</Th>
              <Th className="text-right">Custo</Th>
              <Th className="text-right">Lucro bruto</Th>
              <Th className="text-right">Despesas</Th>
              <Th className="text-right">Comissões</Th>
              <Th className="text-right">Lucro líquido</Th>
            </Tr>
          </Thead>
          <tbody>
            {dre.map((m) => (
              <Tr key={m.label}>
                <Td className="font-medium capitalize text-slate-900">{m.label}</Td>
                <Td className="text-right tabular-nums">{m.veiculosVendidos}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.receitaTotal)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.custoTotal)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.lucroBruto)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.despesas)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.comissoes)}</Td>
                <Td
                  className={`text-right font-semibold tabular-nums ${
                    m.lucroLiquido >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {formatCurrency(m.lucroLiquido)}
                </Td>
              </Tr>
            ))}
            <Tr className="bg-slate-50 font-semibold">
              <Td className="text-slate-900">Total</Td>
              <Td className="text-right tabular-nums">{totals.veiculosVendidos}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(totals.receitaTotal)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(totals.custoTotal)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(totals.lucroBruto)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(totals.despesas)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(totals.comissoes)}</Td>
              <Td
                className={`text-right tabular-nums ${
                  totals.lucroLiquido >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(totals.lucroLiquido)}
              </Td>
            </Tr>
          </tbody>
        </Table>
        <p className="px-5 py-3 text-xs text-slate-400">
          Receita e custo seguem a data da venda; despesas entram quando são pagas (regime de caixa).
          Custos lançados nos veículos entram no custo da venda (não em despesas), evitando dupla contagem.
        </p>
      </Card>
    </div>
  );
}
