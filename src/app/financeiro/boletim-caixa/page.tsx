import { prisma } from "@/lib/prisma";
import { getCashboxState } from "@/lib/cashbox";
import { getCompany } from "@/lib/company";
import { buildCashStatement } from "@/lib/cash-statement";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import type { PatrimonialStats } from "@/lib/patrimonial";
import { Card, Input, Button, LinkButton, Table, Td, Th, Thead, Tr } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

type SnapshotData = PatrimonialStats & {
  equacao: number;
  lucroPrejuizo: number;
  check1Ok: boolean;
  check2Ok: boolean;
};

function parseDay(s: string | undefined, fallback: Date): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`);
  return fallback;
}
function dayStartUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export default async function BoletimCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; sem?: string }>;
}) {
  const { de, ate, sem } = await searchParams;
  const cashbox = await getCashboxState();
  const baseDay = cashbox.open && cashbox.session ? cashbox.session.workDate : new Date();
  const defaultStr = toDateInputValue(dayStartUTC(baseDay));

  const start = parseDay(de, dayStartUTC(baseDay));
  const end = parseDay(ate, start);
  const includeSnapshot = sem !== "1";
  const deStr = toDateInputValue(start);
  const ateStr = toDateInputValue(end);

  const [company, statement, snapshotRow] = await Promise.all([
    getCompany(),
    buildCashStatement(start, end),
    prisma.dashboardSnapshot.findFirst({
      where: { referenceDate: { gte: dayStartUTC(end), lt: new Date(dayStartUTC(end).getTime() + 86400000) } },
      orderBy: { version: "desc" },
    }),
  ]);
  const snap = snapshotRow ? (snapshotRow.data as unknown as SnapshotData) : null;

  const periodoLabel = deStr === ateStr ? formatDate(start) : `${formatDate(start)} a ${formatDate(end)}`;

  const indicadores: { label: string; value: string; tone?: "pos" | "neg" | "warn" | "info" | "cap" }[] = snap
    ? [
        { label: "Saldo em Caixa", value: formatCurrency(snap.saldoCaixa), tone: snap.saldoCaixa < 0 ? "neg" : "pos" },
        { label: "Estoque de Veículos", value: formatCurrency(snap.estoqueVeiculosPago), tone: "info" },
        { label: "Almoxarifado", value: formatCurrency(snap.almoxarifado), tone: "info" },
        { label: "Capital", value: formatCurrency(snap.saldoCapital), tone: "cap" },
        { label: "Contas a Receber", value: formatCurrency(snap.contasAReceber), tone: "pos" },
        { label: "Contas a Pagar", value: formatCurrency(snap.contasAPagar), tone: "warn" },
        { label: "Total Pago", value: formatCurrency(snap.totalPago), tone: "info" },
        {
          label: "Títulos Vencidos",
          value: `${snap.titulosVencidosCount} · ${formatCurrency(snap.titulosVencidosValor)}`,
          tone: "neg",
        },
        { label: "Equação Patrimonial (L/P)", value: formatCurrency(snap.equacao), tone: snap.equacao < 0 ? "neg" : "pos" },
        {
          label: "Farol de integridade",
          value: snap.check1Ok && snap.check2Ok ? "✅ OK" : "⚠️ Divergente",
          tone: snap.check1Ok && snap.check2Ok ? "pos" : "neg",
        },
      ]
    : [];
  const toneClass: Record<string, string> = {
    pos: "text-emerald-700",
    neg: "text-rose-700",
    warn: "text-amber-700",
    info: "text-blue-700",
    cap: "text-violet-700",
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Filtros (some na impressão) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <LinkButton href="/financeiro/contas" variant="secondary">← Voltar ao caixa</LinkButton>
        <PrintButton title={`Boletim de Caixa ${periodoLabel}`} rootSelector="#boletim" />
      </div>
      <Card className="mb-4 px-4 py-3 print:hidden">
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            De
            <Input type="date" name="de" defaultValue={deStr || defaultStr} className="mt-0.5 h-11 w-44" />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Até
            <Input type="date" name="ate" defaultValue={ateStr || defaultStr} className="mt-0.5 h-11 w-44" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="sem" value="1" defaultChecked={!includeSnapshot} className="h-4 w-4 rounded border-slate-300" />
            Omitir posição patrimonial
          </label>
          <Button type="submit" className="h-11">Gerar</Button>
        </form>
      </Card>

      <Card className="p-6 sm:p-8">
        <main id="boletim">
          <CompanyDocHeader
            company={company}
            right={
              <>
                <p className="font-bold">BOLETIM DE CAIXA</p>
                <p className="text-slate-500">Período: {periodoLabel}</p>
              </>
            }
          />

          {/* Página 1 — Posição patrimonial (snapshot arquivado no fechamento) */}
          {includeSnapshot ? (
            <section className="mb-8">
              <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                Posição patrimonial — {formatDate(end)}
              </h2>
              {snap ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {indicadores.map((it) => (
                      <div key={it.label} className="rounded-lg border border-slate-200 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{it.label}</p>
                        <p className={`text-lg font-bold tabular-nums ${it.tone ? toneClass[it.tone] : "text-slate-900"}`}>
                          {it.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Snapshot arquivado no fechamento do caixa de {formatDate(end)} — arquivado por{" "}
                    {snapshotRow?.archivedBy || "—"} em{" "}
                    {snapshotRow ? snapshotRow.archivedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}{" "}
                    (versão {snapshotRow?.version}).
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Não há snapshot patrimonial arquivado para {formatDate(end)}. O snapshot só é gravado no{" "}
                  <strong>fechamento do caixa</strong> dessa data (datas anteriores ao recurso, ou dias cujo caixa nunca foi
                  fechado, não têm snapshot).
                </div>
              )}
            </section>
          ) : null}

          {/* Extrato por conta */}
          {statement.contas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nenhuma conta com movimento no período.</p>
          ) : (
            statement.contas.map((c) => (
              <section key={c.accountId} className="mb-6">
                <h2 className="mb-1 flex items-center justify-between border-b border-slate-200 pb-1">
                  <span className="text-sm font-bold text-slate-800">{c.accountName}</span>
                  <span className="text-xs text-slate-500">
                    Saldo anterior: <strong className="tabular-nums">{formatCurrency(c.saldoAnterior)}</strong>
                  </span>
                </h2>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Data</Th>
                      <Th>Documento</Th>
                      <Th>Histórico</Th>
                      <Th className="text-right">Entrada</Th>
                      <Th className="text-right">Saída</Th>
                      <Th className="text-right">Saldo</Th>
                    </Tr>
                  </Thead>
                  <tbody>
                    {c.movimentos.length === 0 ? (
                      <Tr>
                        <td colSpan={6} className="px-3 py-2 text-sm text-slate-400">Sem movimento no período.</td>
                      </Tr>
                    ) : (
                      c.movimentos.map((m) => (
                        <Tr key={m.id}>
                          <Td className="whitespace-nowrap text-slate-600">{formatDate(m.date)}</Td>
                          <Td className="text-slate-500">{m.documentNumber || "—"}</Td>
                          <Td className="text-slate-800">
                            {m.description}
                            {m.who && m.who !== "—" ? <span className="text-slate-400"> · {m.who}</span> : null}
                          </Td>
                          <Td className="text-right tabular-nums text-emerald-700">
                            {m.kind === "entrada" ? formatCurrency(m.amount) : ""}
                          </Td>
                          <Td className="text-right tabular-nums text-rose-700">
                            {m.kind === "saida" ? formatCurrency(m.amount) : ""}
                          </Td>
                          <Td className={`text-right tabular-nums ${m.saldo < 0 ? "text-rose-700" : "text-slate-700"}`}>
                            {formatCurrency(m.saldo)}
                          </Td>
                        </Tr>
                      ))
                    )}
                  </tbody>
                </Table>
                <div className="mt-1 flex flex-wrap justify-end gap-x-6 gap-y-1 text-xs">
                  <span className="text-slate-500">Entradas: <strong className="tabular-nums text-emerald-700">{formatCurrency(c.totalIn)}</strong></span>
                  <span className="text-slate-500">Saídas: <strong className="tabular-nums text-rose-700">{formatCurrency(c.totalOut)}</strong></span>
                  <span className="text-slate-500">Saldo final: <strong className="tabular-nums text-slate-900">{formatCurrency(c.saldoFinal)}</strong></span>
                </div>
              </section>
            ))
          )}

          {/* Consolidado */}
          {statement.contas.length > 0 ? (
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Consolidado</p>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-600">Saldo anterior: <strong className="tabular-nums">{formatCurrency(statement.consolidado.saldoAnterior)}</strong></span>
                <span className="text-slate-600">Entradas: <strong className="tabular-nums text-emerald-700">{formatCurrency(statement.consolidado.totalIn)}</strong></span>
                <span className="text-slate-600">Saídas: <strong className="tabular-nums text-rose-700">{formatCurrency(statement.consolidado.totalOut)}</strong></span>
                <span className="text-slate-900 font-semibold">Saldo final: <strong className="tabular-nums">{formatCurrency(statement.consolidado.saldoFinal)}</strong></span>
              </div>
            </div>
          ) : null}
        </main>
      </Card>
    </div>
  );
}
