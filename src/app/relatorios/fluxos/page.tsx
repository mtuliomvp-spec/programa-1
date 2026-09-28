import { fluxosPorConta, type FluxoRelatorio, type LinhaFluxo } from "@/lib/fluxos-por-conta";
import { formatCurrency, formatDate, parseDateInput, toDateInputValue } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const NOME_FLUXO: Record<FluxoRelatorio, string> = {
  CAPITAL: "Capital",
  VEICULOS: "Veículos",
  ADMINISTRATIVO: "Administrativo",
  PECAS: "Peças",
  TRANSFERENCIA: "Transferências entre contas",
};

const valida = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * Fluxos por conta financeira, CONSOLIDADOS no período: uma linha por fluxo +
 * sócio/placa/categoria + tipo + conta, com a quantidade de lançamentos e o
 * total. Para alimentar outro sistema — o detalhe está no Livro caixa.
 */
export default async function FluxosPorContaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sp = await searchParams;
  const hoje = new Date();
  const inicioMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const deStr = valida(sp.de) ?? toDateInputValue(inicioMes);
  const ateStr = valida(sp.ate) ?? toDateInputValue(hoje);
  const de = new Date(`${deStr}T00:00:00.000Z`);
  const ate = new Date(`${ateStr}T23:59:59.999Z`);
  const { linhas, porConta } = await fluxosPorConta(de, ate);

  const secoes = (["CAPITAL", "VEICULOS", "ADMINISTRATIVO", "PECAS", "TRANSFERENCIA"] as FluxoRelatorio[])
    .map((f) => ({ fluxo: f, linhas: linhas.filter((l) => l.fluxo === f) }))
    .filter((s) => s.linhas.length > 0);
  const soma = (ls: LinhaFluxo[], d: LinhaFluxo["direcao"]) =>
    Math.round(ls.filter((l) => l.direcao === d).reduce((s, l) => s + l.valor, 0) * 100) / 100;

  const periodo = `${formatDate(parseDateInput(deStr))} a ${formatDate(parseDateInput(ateStr))}`;

  return (
    <div>
      <PageHeader
        title="Fluxos por conta financeira"
        description={`Consolidado de ${periodo} · só o que foi efetivamente pago e recebido`}
        action={<PrintButton mode="table" title="Fluxos por conta financeira" subtitle={`Período: ${periodo}`} />}
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          De
          <input
            type="date"
            name="de"
            defaultValue={deStr}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={ateStr}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          />
        </label>
        <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
          Gerar
        </button>
      </form>

      {secoes.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum movimento no período" description="Escolha outro período." />
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader
              title="Por fluxo, conta e tipo"
              description="Os lançamentos iguais (mesmo sócio/placa/categoria, tipo e conta) viram uma linha com o total"
            />
            <Table>
              <Thead>
                <Tr>
                  <Th>Fluxo</Th>
                  <Th>Sócio / placa / categoria</Th>
                  <Th>Tipo</Th>
                  <Th>Conta</Th>
                  <Th className="text-right">Lanç.</Th>
                  <Th className="text-right">Valor</Th>
                </Tr>
              </Thead>
              <tbody>
                {secoes.map((s) => (
                  <FluxoSecao key={s.fluxo} fluxo={s.fluxo} linhas={s.linhas} soma={soma} />
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Totais por conta"
              description="Entradas e saídas de cada conta no período (transferência sai da origem e entra no destino)"
            />
            <Table>
              <Thead>
                <Tr>
                  <Th>Conta</Th>
                  <Th className="text-right">Entradas</Th>
                  <Th className="text-right">Saídas</Th>
                  <Th className="text-right">Líquido</Th>
                </Tr>
              </Thead>
              <tbody>
                {porConta.map((c) => (
                  <Tr key={c.conta}>
                    <Td className="font-medium text-slate-900">{c.conta}</Td>
                    <Td className="text-right tabular-nums text-emerald-700">{formatCurrency(c.entradas)}</Td>
                    <Td className="text-right tabular-nums text-rose-600">{formatCurrency(c.saidas)}</Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {formatCurrency(Math.round((c.entradas - c.saidas) * 100) / 100)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function FluxoSecao({
  fluxo,
  linhas,
  soma,
}: {
  fluxo: FluxoRelatorio;
  linhas: LinhaFluxo[];
  soma: (ls: LinhaFluxo[], d: LinhaFluxo["direcao"]) => number;
}) {
  const entradas = soma(linhas, "entrada");
  const saidas = soma(linhas, "saida");
  const transf = soma(linhas, "transferencia");
  return (
    <>
      {linhas.map((l, i) => (
        <Tr key={`${fluxo}-${i}`}>
          <Td className="whitespace-nowrap text-slate-500">{NOME_FLUXO[fluxo]}</Td>
          <Td className="font-medium text-slate-900">{l.item}</Td>
          <Td>{l.tipo}</Td>
          <Td className="whitespace-nowrap">{l.conta}</Td>
          <Td className="text-right tabular-nums">{l.qtd}</Td>
          <Td
            className={`text-right tabular-nums ${
              l.direcao === "entrada" ? "text-emerald-700" : l.direcao === "saida" ? "text-rose-600" : ""
            }`}
          >
            {formatCurrency(l.valor)}
          </Td>
        </Tr>
      ))}
      <Tr>
        <Td className="font-semibold text-slate-700">Total {NOME_FLUXO[fluxo]}</Td>
        <Td>{""}</Td>
        <Td>{""}</Td>
        <Td>{""}</Td>
        <Td>{""}</Td>
        <Td className="whitespace-nowrap text-right text-xs font-semibold tabular-nums">
          {fluxo === "TRANSFERENCIA"
            ? formatCurrency(transf)
            : `entradas ${formatCurrency(entradas)} · saídas ${formatCurrency(saidas)}`}
        </Td>
      </Tr>
    </>
  );
}
