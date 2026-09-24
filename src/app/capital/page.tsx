import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureCompanyBeneficiary } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import { capitalPrelancado } from "@/lib/capital-prelancado";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { requireModule, userCan } from "@/lib/guards";
import NewBeneficiaryForm from "./NewBeneficiaryForm";
import ContabilizarButton from "./ContabilizarButton";
import ZeroBalanceSection from "./ZeroBalanceSection";

export const dynamic = "force-dynamic";

export default async function CapitalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string }>;
}) {
  // Quem só tem "Meu capital" não vê a lista de todos: vai para o próprio.
  await requireModule("administrativo", "/capital/meu");
  const { q: qParam, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const canManage = await userCan("administrativo", "capital");
  // A empresa dos Parâmetros sempre aparece como beneficiária própria
  await ensureCompanyBeneficiary();
  const [beneficiaries, allocationsByBenef, prelancado] = await Promise.all([
    prisma.capitalBeneficiary.findMany({
      include: { transactions: true },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
    }),
    prisma.investmentAllocation.groupBy({ by: ["beneficiaryId"], _sum: { amount: true } }),
    // O que a fila do caixa ainda vai mexer no capital (crédito já informado,
    // esperando o ok do caixa do dia).
    capitalPrelancado(),
  ]);
  const appliedByBenef = new Map(
    allocationsByBenef.map((a) => [a.beneficiaryId, Math.round((a._sum.amount ?? 0) * 100) / 100]),
  );

  const mapped = beneficiaries.map((b) => {
    const sum = (kind: string) =>
      b.transactions.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
    const aportes = sum("APORTE");
    const retiradas = sum("RETIRADA");
    const proLabore = sum("PRO_LABORE");
    const saldo = aportes - retiradas;
    const aplicado = appliedByBenef.get(b.id) ?? 0;
    return { ...b, aportes, retiradas, proLabore, saldo, aplicado, livre: saldo - aplicado };
  });

  const filtered = mapped.filter(
    (b) => matchesSearch(q, b.name, b.saldo, formatCurrency(b.saldo)) && inValueRange(b.saldo, min, max),
  );

  // Totais somam TODOS (inclusive os vinculados/caução) — não podem divergir dos
  // checks de saldo nem da equação patrimonial; o agrupamento é só visual.
  const totalInvestido = filtered.reduce((s, b) => s + b.saldo, 0);
  const totalAportes = filtered.reduce((s, b) => s + b.aportes, 0);
  const totalRetiradas = filtered.reduce((s, b) => s + b.retiradas, 0);

  // Caução por responsável: soma dos saldos dos vinculados (de todos, não só os
  // filtrados), para exibir no card do responsável.
  const caucaoByParent = new Map<string, { count: number; total: number }>();
  for (const b of mapped) {
    if (b.parentId) {
      const cur = caucaoByParent.get(b.parentId) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += b.saldo;
      caucaoByParent.set(b.parentId, cur);
    }
  }

  // A LISTA de cards esconde os vinculados (aparecem sob o responsável).
  const cards = filtered.filter((b) => b.parentId == null);
  // Sócios com saldo ZERADO vão para uma seção recolhível (o usuário pode
  // ocultá-los). Qualquer movimentação tira o sócio do grupo automaticamente —
  // com saldo ≠ 0 ele volta para a lista normal.
  // Pré-lançado conta como movimentação: quem vai receber um aporte não pode
  // ficar escondido entre os zerados.
  const comSaldo = cards.filter((b) => Math.abs(b.saldo) >= 0.005 || prelancado.has(b.id));
  const zerados = cards.filter((b) => Math.abs(b.saldo) < 0.005 && !prelancado.has(b.id));

  // RELATÓRIO (só na impressão/PDF): a tela mostra cards, que no papel viram
  // uma coluna estreita cheia de espaço vazio e um botão que ninguém clica no
  // papel. Aqui a mesma informação sai como lista: uma linha por beneficiário,
  // o vinculado logo abaixo do responsável e o total fechando embaixo.
  const filhosPorPai = new Map<string, typeof mapped>();
  for (const b of mapped) {
    if (!b.parentId) continue;
    const atual = filhosPorPai.get(b.parentId) ?? [];
    atual.push(b);
    filhosPorPai.set(b.parentId, atual);
  }
  const linhasRelatorio = cards.flatMap((b) => [
    { b, caucao: false },
    ...(filhosPorPai.get(b.id) ?? []).map((f) => ({ b: f, caucao: true })),
  ]);
  const temProLabore = filtered.some((b) => b.proLabore > 0.005);
  const totalAplicado = filtered.reduce((s, b) => s + b.aplicado, 0);
  const totalProLabore = filtered.reduce((s, b) => s + b.proLabore, 0);

  const renderCard = (b: (typeof cards)[number]) => (
    <Link key={b.id} href={`/capital/${b.id}`} className="block">
      <Card className="px-5 py-4 transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              {b.name}
              {b.isCompany ? <Badge tone="info">Empresa</Badge> : null}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Aportes {formatCurrency(b.aportes)} · Retiradas {formatCurrency(b.retiradas)}
              {b.proLabore > 0 ? ` · Pró-labore pago ${formatCurrency(b.proLabore)}` : ""}
            </p>
            {b.aplicado > 0 ? (
              <p className="mt-0.5 text-xs font-medium text-emerald-700">
                📈 Aplicado {formatCurrency(b.aplicado)} ·{" "}
                <span className={b.livre < 0 ? "text-rose-600" : ""}>
                  Livre {formatCurrency(b.livre)}
                </span>
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Saldo investido</p>
            <p
              className={`text-lg font-bold ${b.saldo >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatCurrency(b.saldo)}
            </p>
            {canManage && Math.abs(b.saldo) >= 0.01 ? (
              <ContabilizarButton beneficiaryId={b.id} name={b.name} saldo={b.saldo} />
            ) : null}
          </div>
        </div>
        {prelancado.has(b.id) ? (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
              ⏳ Pré-lançado · esperando o ok do caixa
            </p>
            {prelancado.get(b.id)!.itens.map((i, k) => (
              <p key={k} className="text-xs text-sky-900">
                <span className={i.kind === "APORTE" ? "font-semibold text-emerald-700" : "font-semibold text-rose-600"}>
                  {i.kind === "APORTE" ? "+" : "−"}
                  {formatCurrency(i.amount)}
                </span>{" "}
                {i.kind === "APORTE" ? "aporte" : "retirada"} · {formatDate(i.date)} · {i.description}
              </p>
            ))}
            <p className="mt-1 text-xs text-sky-900">
              Saldo investido após o ok:{" "}
              <strong className={b.saldo + prelancado.get(b.id)!.liquido < 0 ? "text-rose-600" : ""}>
                {formatCurrency(b.saldo + prelancado.get(b.id)!.liquido)}
              </strong>
            </p>
          </div>
        ) : null}
        {caucaoByParent.has(b.id) ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                🏠 Caução de terceiros · {caucaoByParent.get(b.id)!.count} vinculado(s)
              </p>
              <p className="text-[11px] text-amber-700/80">
                Guardada em nome de terceiros — <strong>não entra</strong> no saldo investido dele.
              </p>
            </div>
            <p className="text-base font-bold text-amber-700">
              {formatCurrency(caucaoByParent.get(b.id)!.total)}
            </p>
          </div>
        ) : null}
      </Card>
    </Link>
  );

  return (
    <div>
      {/* No papel quem dá o título é o cabeçalho do relatório (com a data de
          emissão), logo abaixo — dois títulos seguidos só ocupariam espaço. */}
      <div className="print:hidden">
        <PageHeader
          title="Capital dos sócios"
          description="Aportes, retiradas e pró-labore individualizados por beneficiário"
        />
      </div>

      <ReportToolbar
        basePath="/capital"
        printTitle="Capital dos sócios"
        q={q}
        placeholder="Buscar por beneficiário..."
        value
        min={min}
        max={max}
      />

      {/* Os três números do topo saem da impressão: a última linha da tabela já
          fecha aportes, retiradas e saldo, e no papel eles custam meia página. */}
      <div className="mb-4 grid grid-cols-1 gap-4 print:hidden sm:grid-cols-3">
        <StatCard label="Capital investido" value={formatCurrency(totalInvestido)} hint="aportes menos retiradas" />
        <StatCard label="Total de aportes" value={formatCurrency(totalAportes)} tone="positive" />
        <StatCard label="Total de retiradas" value={formatCurrency(totalRetiradas)} tone="negative" />
      </div>

      {/* Relatório em lista: só no papel. Tabela própria (e não a da tela, que
          tem largura mínima para rolar de lado): no papel não há rolagem, e
          coluna que não cabe é coluna que some. */}
      {linhasRelatorio.length > 0 ? (
        <div className="hidden print:block">
          <table className="w-full border-collapse text-[10px] leading-tight">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                <th className="px-1.5 py-1.5 font-medium">Beneficiário</th>
                <th className="px-1.5 py-1.5 text-right font-medium">Aportes</th>
                <th className="px-1.5 py-1.5 text-right font-medium">Retiradas</th>
                {temProLabore ? <th className="px-1.5 py-1.5 text-right font-medium">Pró-labore</th> : null}
                <th className="px-1.5 py-1.5 text-right font-medium">Saldo investido</th>
                <th className="px-1.5 py-1.5 text-right font-medium">Aplicado</th>
                <th className="px-1.5 py-1.5 text-right font-medium">Livre</th>
              </tr>
            </thead>
            <tbody>
              {linhasRelatorio.map(({ b, caucao }) => (
                <tr key={b.id} className="border-b border-slate-100">
                  <td className="px-1.5 py-1.5 text-slate-700">
                    {caucao ? <span className="text-slate-400">↳ caução · </span> : null}
                    {b.name}
                    {b.isCompany ? <span className="text-slate-400"> (empresa)</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                    {formatCurrency(b.aportes)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                    {formatCurrency(b.retiradas)}
                  </td>
                  {temProLabore ? (
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                      {b.proLabore > 0.005 ? formatCurrency(b.proLabore) : "—"}
                    </td>
                  ) : null}
                  <td
                    className={`whitespace-nowrap px-1.5 py-1.5 text-right font-semibold tabular-nums ${
                      b.saldo < 0 ? "text-rose-700" : "text-slate-900"
                    }`}
                  >
                    {formatCurrency(b.saldo)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                    {b.aplicado > 0.005 ? formatCurrency(b.aplicado) : "—"}
                  </td>
                  <td
                    className={`whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums ${
                      b.aplicado > 0.005 && b.livre < 0 ? "text-rose-700" : ""
                    }`}
                  >
                    {b.aplicado > 0.005 ? formatCurrency(b.livre) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-y border-slate-300 bg-slate-50 font-semibold">
                <td className="px-1.5 py-1.5">Total · {linhasRelatorio.length} beneficiários</td>
                <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                  {formatCurrency(totalAportes)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                  {formatCurrency(totalRetiradas)}
                </td>
                {temProLabore ? (
                  <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                    {formatCurrency(totalProLabore)}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                  {formatCurrency(totalInvestido)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                  {formatCurrency(totalAplicado)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
                  {formatCurrency(Math.round((totalInvestido - totalAplicado) * 100) / 100)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[9px] leading-snug text-slate-500">
            Saldo investido = aportes − retiradas. Aplicado = capital em contas de Aplicação; livre é o que
            resta dele. Caução de terceiros aparece sob o responsável e não entra no saldo investido dele,
            mas conta no total da loja. Pró-labore é despesa da loja — não entra no saldo.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 print:hidden lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {cards.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum sócio cadastrado"
                description="Cadastre os beneficiários ao lado para acompanhar o capital de cada um."
              />
            </Card>
          ) : (
            <>
              {comSaldo.map(renderCard)}
              {zerados.length > 0 ? (
                <ZeroBalanceSection count={zerados.length}>
                  {zerados.map(renderCard)}
                </ZeroBalanceSection>
              ) : null}
            </>
          )}
        </div>

        {canManage ? (
          <Card className="h-fit print:hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Novo beneficiário</h2>
            </div>
            <div className="p-5">
              <NewBeneficiaryForm />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
