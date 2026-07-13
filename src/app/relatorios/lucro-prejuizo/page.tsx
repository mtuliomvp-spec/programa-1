import { getMonthlyDre } from "@/lib/reports";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ProfitBarChart from "@/components/ProfitBarChart";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function LucroPrejuizoPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const params = await searchParams;
  const months = params.meses === "1" ? 1 : params.meses === "6" ? 6 : 12;
  const dre = await getMonthlyDre(months);

  const t = dre.reduce(
    (a, m) => ({
      receitaVeiculos: a.receitaVeiculos + m.receitaVeiculos,
      receitaPecas: a.receitaPecas + m.receitaPecas,
      receitaTotal: a.receitaTotal + m.receitaTotal,
      custoVeiculos: a.custoVeiculos + m.custoVeiculos,
      custoPecas: a.custoPecas + m.custoPecas,
      custoTotal: a.custoTotal + m.custoTotal,
      lucroBruto: a.lucroBruto + m.lucroBruto,
      despesas: a.despesas + m.despesas,
      comissoes: a.comissoes + m.comissoes,
      lucroLiquido: a.lucroLiquido + m.lucroLiquido,
      veiculosVendidos: a.veiculosVendidos + m.veiculosVendidos,
    }),
    {
      receitaVeiculos: 0, receitaPecas: 0, receitaTotal: 0, custoVeiculos: 0, custoPecas: 0,
      custoTotal: 0, lucroBruto: 0, despesas: 0, comissoes: 0, lucroLiquido: 0, veiculosVendidos: 0,
    },
  );

  const lucro = t.lucroLiquido >= 0;
  const periodLabel = months === 1 ? "mês atual" : `últimos ${months} meses`;
  const margem = t.receitaTotal > 0 ? (t.lucroLiquido / t.receitaTotal) * 100 : 0;

  // Linha do demonstrativo (rótulo + valor + estilo)
  const Row = ({
    label,
    value,
    kind = "normal",
  }: {
    label: string;
    value: number;
    kind?: "normal" | "sub" | "total" | "final";
  }) => (
    <div
      className={`flex items-center justify-between px-5 py-2.5 ${
        kind === "sub" ? "pl-9 text-sm text-slate-500" : ""
      } ${kind === "total" ? "border-t border-slate-200 font-semibold text-slate-800" : ""} ${
        kind === "final" ? "border-t-2 border-slate-300 text-base font-bold" : ""
      }`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums ${
          kind === "final"
            ? value >= 0
              ? "text-emerald-600"
              : "text-rose-600"
            : "text-slate-900"
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Lucro / Prejuízo"
        description={`Resultado da loja no ${periodLabel}`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <LinkButton href="/relatorios/lucro-prejuizo?meses=1" variant={months === 1 ? "primary" : "secondary"}>
              Mês atual
            </LinkButton>
            <LinkButton href="/relatorios/lucro-prejuizo?meses=6" variant={months === 6 ? "primary" : "secondary"}>
              6 meses
            </LinkButton>
            <LinkButton href="/relatorios/lucro-prejuizo?meses=12" variant={months === 12 ? "primary" : "secondary"}>
              12 meses
            </LinkButton>
            <PrintButton />
          </div>
        }
      />

      {/* Destaque do resultado */}
      <Card className={`mb-4 border-2 ${lucro ? "border-emerald-200" : "border-rose-200"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
              {lucro ? "Lucro do período" : "Prejuízo do período"}
            </p>
            <p className={`mt-1 text-4xl font-bold ${lucro ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(t.lucroLiquido)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t.veiculosVendidos} veículo(s) vendido(s) · margem {margem.toFixed(1)}% sobre a receita
            </p>
          </div>
          <span className="text-5xl" aria-hidden>
            {lucro ? "📈" : "📉"}
          </span>
        </div>
      </Card>

      {/* Demonstrativo resumido */}
      <Card className="mb-4">
        <CardHeader title="Como chegamos nesse resultado" description="Receitas − custos das vendas − despesas" />
        <div className="divide-y divide-slate-100">
          <Row label="Vendas de veículos" value={t.receitaVeiculos} kind="sub" />
          <Row label="Vendas de peças" value={t.receitaPecas} kind="sub" />
          <Row label="( = ) Total de receitas" value={t.receitaTotal} kind="total" />
          <Row label="Custo dos veículos vendidos" value={-t.custoVeiculos} kind="sub" />
          <Row label="Custo das peças vendidas" value={-t.custoPecas} kind="sub" />
          <Row label="( = ) Lucro bruto" value={t.lucroBruto} kind="total" />
          <Row label="Despesas operacionais" value={-t.despesas} kind="sub" />
          <Row label="Comissões" value={-t.comissoes} kind="sub" />
          <Row label={lucro ? "( = ) Lucro líquido" : "( = ) Prejuízo líquido"} value={t.lucroLiquido} kind="final" />
        </div>
        <p className="px-5 py-3 text-xs text-slate-400">
          O custo de cada veículo (compra + preparação) entra no resultado no mês em que ele é
          vendido — por isso um carro parado em estoque ainda não vira lucro nem prejuízo.
        </p>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Lucro / prejuízo mês a mês" />
        <div className="p-5">
          <ProfitBarChart data={dre.map((m) => ({ label: m.label, lucroLiquido: m.lucroLiquido }))} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Detalhe por mês" />
        <Table>
          <Thead>
            <Tr>
              <Th>Mês</Th>
              <Th className="text-right">Receitas</Th>
              <Th className="text-right">Custo das vendas</Th>
              <Th className="text-right">Despesas</Th>
              <Th className="text-right">Resultado</Th>
            </Tr>
          </Thead>
          <tbody>
            {dre.map((m) => (
              <Tr key={m.label}>
                <Td className="font-medium text-slate-900">{m.label}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.receitaTotal)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.custoTotal)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(m.despesas + m.comissoes)}</Td>
                <Td
                  className={`text-right font-semibold tabular-nums ${
                    m.lucroLiquido >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {formatCurrency(m.lucroLiquido)}
                </Td>
              </Tr>
            ))}
            <Tr className="bg-slate-50 font-bold">
              <Td>Total</Td>
              <Td className="text-right tabular-nums">{formatCurrency(t.receitaTotal)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(t.custoTotal)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(t.despesas + t.comissoes)}</Td>
              <Td
                className={`text-right tabular-nums ${
                  t.lucroLiquido >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatCurrency(t.lucroLiquido)}
              </Td>
            </Tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
