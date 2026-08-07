import { getProfitLossStatement } from "@/lib/reports";
import { getClosedMonths, monthBounds, monthLabelBR } from "@/lib/monthly-closing";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inValueRange, inDateRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td, Th, Thead, Tr } from "@/components/ui";
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
  SALDO_INICIAL: { label: "Saldo inicial", tone: "default" },
  FECHAMENTO: { label: "Fechamento", tone: "default" },
};

// Fallback defensivo: qualquer tipo não mapeado não pode derrubar a página.
const metaFor = (kind: string) => kindMeta[kind] ?? { label: kind, tone: "default" as const };

export default async function LucroPrejuizoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; q?: string; tipo?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const { mes, tipo, de, ate, min, max } = await searchParams;
  const q = ((await searchParams).q ?? "").trim();
  // Com qualquer filtro ativo, o saldo acumulado deixa de fazer sentido (a linha
  // deixa de ser o extrato completo) — a coluna Saldo acumulado fica oculta.
  const tipoFilter = tipo && tipo !== "TODOS" ? tipo : "";
  const filtering =
    Boolean(q) || Boolean(tipoFilter) || Boolean(de) || Boolean(ate) || Boolean(min?.trim()) || Boolean(max?.trim());
  const closings = await getClosedMonths(); // ordem: mais recente primeiro

  // ?mes=AAAA-MM abre um mês FECHADO específico; sem isso, mostra o período aberto.
  const m = mes?.match(/^(\d{4})-(\d{2})$/);
  const selected = m ? closings.find((c) => c.year === Number(m[1]) && c.month === Number(m[2])) : null;

  const now = new Date();
  let scopeStart: Date;
  let scopeEnd: Date;
  let excludeFechamento = false;
  let periodLabel: string;
  if (selected) {
    const b = monthBounds(selected.year, selected.month);
    scopeStart = b.start;
    scopeEnd = b.end;
    excludeFechamento = true; // mostra o resultado real do mês (o que foi ao capital)
    periodLabel = `${monthLabelBR(selected.year, selected.month)} — mês encerrado`;
  } else {
    // Período aberto: do 1º dia após o último mês fechado até o fim do mês atual.
    scopeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    scopeStart = closings.length
      ? monthBounds(closings[0].year, closings[0].month).end
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    periodLabel = "período aberto";
  }

  const s = await getProfitLossStatement(12, { start: scopeStart, end: scopeEnd, excludeFechamento });

  const lucro = s.lucroLiquido >= 0;
  const margem = s.receitaTotal > 0 ? (s.lucroLiquido / s.receitaTotal) * 100 : 0;

  // Extrato do mais antigo ao mais recente, com o saldo acumulado após cada
  // lançamento (como no Livro Caixa). A última linha bate com o resultado do
  // período (a soma das contribuições == lucroLiquido).
  const extrato = [...s.entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  let acc = 0;
  const linhas = extrato.map((e) => ({ ...e, saldo: (acc += e.value) }));

  // Origens presentes no período, para o filtro por origem.
  const origensPresentes = Array.from(new Set(extrato.map((e) => e.kind)));

  // Busca + filtros (origem, data, faixa de valor) sobre os campos exibidos.
  // Com filtro ativo o "saldo acumulado" fica oculto (só vale no extrato completo).
  const linhasVisiveis = filtering
    ? linhas.filter(
        (e) =>
          matchesSearch(
            q,
            formatDate(e.date),
            e.description,
            e.detail,
            metaFor(e.kind).label,
            e.value,
            formatCurrency(e.value),
          ) &&
          inDateRange(e.date, de, ate) &&
          inValueRange(e.value, min, max) &&
          (!tipoFilter || e.kind === tipoFilter),
      )
    : linhas;
  const totalBusca = linhasVisiveis.reduce((soma, e) => soma + e.value, 0);
  const clearHref = mes ? `/financeiro/lucro-prejuizo?mes=${mes}` : "/financeiro/lucro-prejuizo";

  const Row = ({ label, value, kind = "sub" }: { label: string; value: number; kind?: "sub" | "total" | "final" }) => (
    <div
      className={`flex items-center justify-between px-5 py-2.5 ${kind === "sub" ? "pl-9 text-sm text-slate-500" : ""} ${
        kind === "total" ? "border-t border-slate-200 font-semibold text-slate-800" : ""
      } ${kind === "final" ? "border-t-2 border-slate-300 text-base font-bold" : ""}`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums ${
          value < 0 ? "text-rose-600" : kind === "final" ? "text-emerald-600" : "text-slate-900"
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
            <LinkButton href="/financeiro/lucro-prejuizo" variant={!selected ? "primary" : "secondary"}>
              Aberto
            </LinkButton>
            {closings.map((c) => {
              const key = `${c.year}-${String(c.month).padStart(2, "0")}`;
              const active = selected?.id === c.id;
              return (
                <LinkButton
                  key={c.id}
                  href={`/financeiro/lucro-prejuizo?mes=${key}`}
                  variant={active ? "primary" : "secondary"}
                >
                  {monthLabelBR(c.year, c.month)}
                </LinkButton>
              );
            })}
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
          {s.saldosIniciais !== 0 ? (
            <Row label="Saldo inicial de contas cadastradas" value={s.saldosIniciais} kind="sub" />
          ) : null}
          <Row label={lucro ? "( = ) Lucro líquido" : "( = ) Prejuízo líquido"} value={s.lucroLiquido} kind="final" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Extrato do resultado"
          description="Os lançamentos que geraram o lucro/prejuízo. Em veículos e peças entra só a margem (venda − custo)."
        />
        {/* key: recria os campos ao limpar o filtro (ver ReportToolbar). */}
        <form
          key={`${q}|${tipoFilter}|${de ?? ""}|${ate ?? ""}|${min ?? ""}|${max ?? ""}`}
          className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-5 py-3 print:hidden"
        >
          {mes ? <input type="hidden" name="mes" value={mes} /> : null}
          <div className="min-w-[200px] flex-1">
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Buscar
              <Input name="q" defaultValue={q} placeholder="Descrição, origem, valor..." className="mt-0.5" />
            </label>
          </div>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Origem
            <Select name="tipo" defaultValue={tipoFilter || "TODOS"} className="mt-0.5 w-44">
              <option value="TODOS">Todas</option>
              {origensPresentes.map((k) => (
                <option key={k} value={k}>
                  {metaFor(k).label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            De
            <Input type="date" name="de" defaultValue={de} className="mt-0.5 w-40" />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Até
            <Input type="date" name="ate" defaultValue={ate} className="mt-0.5 w-40" />
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
            <LinkButton variant="secondary" href={clearHref}>
              Limpar
            </LinkButton>
          ) : null}
        </form>
        {s.entries.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento no período"
            description="Vendas concluídas e despesas do período aparecem aqui."
          />
        ) : linhasVisiveis.length === 0 ? (
          <EmptyState
            title="Nada encontrado para o filtro"
            description="Tente outros termos ou limpe o filtro."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Origem</Th>
                <Th>Descrição</Th>
                <Th className="text-right">Valor no resultado</Th>
                {!filtering ? <Th className="text-right">Saldo acumulado</Th> : null}
              </Tr>
            </Thead>
            <tbody>
              {linhasVisiveis.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap">{formatDate(e.date)}</Td>
                  <Td>
                    <Badge tone={metaFor(e.kind).tone}>{metaFor(e.kind).label}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-900">
                    {e.description}
                    {e.detail ? <span className="block text-xs font-normal text-slate-400">{e.detail}</span> : null}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {e.value < 0 ? (
                      <span className="text-rose-600">{formatCurrency(e.value)}</span>
                    ) : (
                      formatCurrency(e.value)
                    )}
                  </Td>
                  {!filtering ? (
                    <Td className="text-right font-semibold tabular-nums">
                      {e.saldo < 0 ? (
                        <span className="text-rose-600">{formatCurrency(e.saldo)}</span>
                      ) : (
                        formatCurrency(e.saldo)
                      )}
                    </Td>
                  ) : null}
                </Tr>
              ))}
              <Tr className="bg-slate-50 font-bold">
                <Td>{filtering ? "Total do filtro" : "Resultado do período"}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td className="text-right tabular-nums">
                  {(filtering ? totalBusca : s.lucroLiquido) < 0 ? (
                    <span className="text-rose-600">{formatCurrency(filtering ? totalBusca : s.lucroLiquido)}</span>
                  ) : (
                    formatCurrency(filtering ? totalBusca : s.lucroLiquido)
                  )}
                </Td>
                {!filtering ? (
                  <Td className="text-right tabular-nums">
                    {s.lucroLiquido < 0 ? (
                      <span className="text-rose-600">{formatCurrency(s.lucroLiquido)}</span>
                    ) : (
                      formatCurrency(s.lucroLiquido)
                    )}
                  </Td>
                ) : null}
              </Tr>
            </tbody>
          </Table>
        )}
        {filtering ? (
          <p className="px-5 py-2 text-xs text-slate-500">
            O filtro vale só para este extrato. Os cartões acima (lucro do período e a composição do
            resultado) continuam considerando o período inteiro.
          </p>
        ) : null}
        <p className="px-5 py-3 text-xs text-slate-400">
          O custo do veículo (compra + preparação) entra no resultado no dia em que ele é vendido —
          por isso só a diferença (a margem) aparece aqui, não o valor cheio da venda. As despesas
          entram <strong>quando são pagas</strong> (regime de caixa), acompanhando a equação patrimonial.
        </p>
      </Card>
    </div>
  );
}
