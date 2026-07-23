import { getProfitLossStatement } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const kindMeta: Record<string, { label: string; tone: "info" | "success" | "warning" | "danger" | "default" }> = {
  VEICULO: { label: "Veículo", tone: "info" },
  PECA: { label: "Peça", tone: "success" },
  DESPESA: { label: "Despesa", tone: "warning" },
  COMISSAO: { label: "Comissão", tone: "danger" },
  POS_VENDA: { label: "Pós-venda", tone: "danger" },
  RETORNO: { label: "Retorno financ.", tone: "success" },
  RECEITA: { label: "Outra receita", tone: "success" },
  FECHAMENTO: { label: "Fechamento", tone: "default" },
};

// Fallback defensivo: qualquer tipo não mapeado não pode derrubar a página.
const metaFor = (kind: string) => kindMeta[kind] ?? { label: kind, tone: "default" as const };

export default async function LucroPrejuizoPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const params = await searchParams;
  const months = params.meses === "1" ? 1 : params.meses === "6" ? 6 : 12;
  const s = await getProfitLossStatement(months);

  const lucro = s.lucroLiquido >= 0;
  const periodLabel = months === 1 ? "mês atual" : `últimos ${months} meses`;
  const margem = s.receitaTotal > 0 ? (s.lucroLiquido / s.receitaTotal) * 100 : 0;

  const Row = ({ label, value, kind = "sub" }: { label: string; value: number; kind?: "sub" | "total" | "final" }) => (
    <div
      className={`flex items-center justify-between px-5 py-2.5 ${kind === "sub" ? "pl-9 text-sm text-slate-500" : ""} ${
        kind === "total" ? "border-t border-slate-200 font-semibold text-slate-800" : ""
      } ${kind === "final" ? "border-t-2 border-slate-300 text-base font-bold" : ""}`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums ${
          kind === "final" ? (value >= 0 ? "text-emerald-600" : "text-rose-600") : "text-slate-900"
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
            <LinkButton href="/financeiro/lucro-prejuizo?meses=1" variant={months === 1 ? "primary" : "secondary"}>
              Mês atual
            </LinkButton>
            <LinkButton href="/financeiro/lucro-prejuizo?meses=6" variant={months === 6 ? "primary" : "secondary"}>
              6 meses
            </LinkButton>
            <LinkButton href="/financeiro/lucro-prejuizo?meses=12" variant={months === 12 ? "primary" : "secondary"}>
              12 meses
            </LinkButton>
            <PrintButton />
          </div>
        }
      />

      <Card className={`mb-4 border-2 ${lucro ? "border-emerald-200" : "border-rose-200"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
              {lucro ? "Lucro do período" : "Prejuízo do período"}
            </p>
            <p className={`mt-1 text-4xl font-bold ${lucro ? "text-emerald-600" : "text-rose-600"}`}>
              {formatCurrency(s.lucroLiquido)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {s.veiculosVendidos} veículo(s) vendido(s) · margem {margem.toFixed(1)}% sobre a receita
            </p>
          </div>
          <span className="text-5xl" aria-hidden>
            {lucro ? "📈" : "📉"}
          </span>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Como chegamos nesse resultado" description="Receitas − custo das vendas − despesas" />
        <div className="divide-y divide-slate-100">
          <Row label="Receita de veículos e peças (vendas)" value={s.receitaTotal} kind="total" />
          <Row label="Custo do que foi vendido" value={-s.custoTotal} kind="sub" />
          <Row label="( = ) Lucro bruto" value={s.lucroBruto} kind="total" />
          <Row label="Despesas operacionais" value={-s.despesas} kind="sub" />
          <Row label="Comissões" value={-s.comissoes} kind="sub" />
          {s.posVenda > 0 ? (
            <Row label="Custos pós-venda (veículos já vendidos)" value={-s.posVenda} kind="sub" />
          ) : null}
          {s.retornos > 0 ? (
            <Row label="Retorno de financiamento (financeiras)" value={s.retornos} kind="sub" />
          ) : null}
          {s.outrasReceitas > 0 ? (
            <Row label="Outras receitas (avulsas)" value={s.outrasReceitas} kind="sub" />
          ) : null}
          <Row label={lucro ? "( = ) Lucro líquido" : "( = ) Prejuízo líquido"} value={s.lucroLiquido} kind="final" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Extrato do resultado"
          description="Os lançamentos que geraram o lucro/prejuízo. Em veículos e peças entra só a margem (venda − custo)."
        />
        {s.entries.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento no período"
            description="Vendas concluídas e despesas do período aparecem aqui."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Origem</Th>
                <Th>Descrição</Th>
                <Th className="text-right">Valor no resultado</Th>
              </Tr>
            </Thead>
            <tbody>
              {s.entries.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap">{formatDate(e.date)}</Td>
                  <Td>
                    <Badge tone={metaFor(e.kind).tone}>{metaFor(e.kind).label}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-900">
                    {e.description}
                    {e.detail ? <span className="block text-xs font-normal text-slate-400">{e.detail}</span> : null}
                  </Td>
                  <Td
                    className={`text-right font-semibold tabular-nums ${
                      e.value >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatCurrency(e.value)}
                  </Td>
                </Tr>
              ))}
              <Tr className="bg-slate-50 font-bold">
                <Td>Resultado do período</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className={`text-right tabular-nums ${lucro ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatCurrency(s.lucroLiquido)}
                </Td>
              </Tr>
            </tbody>
          </Table>
        )}
        <p className="px-5 py-3 text-xs text-slate-400">
          O custo do veículo (compra + preparação) entra no resultado no dia em que ele é vendido —
          por isso só a diferença (a margem) aparece aqui, não o valor cheio da venda. As despesas
          entram <strong>quando são pagas</strong> (regime de caixa), acompanhando a equação patrimonial.
        </p>
      </Card>
    </div>
  );
}
