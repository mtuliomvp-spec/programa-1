import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { getClosedMonths, getFirstMovementMonth, getMonthResult, monthLabelBR } from "@/lib/monthly-closing";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { CloseMonthButton, ReopenMonthButton } from "./ClosingButtons";

export const dynamic = "force-dynamic";

export default async function FechamentoMensalPage() {
  await requireModule("financeiro");
  const [canClose, canReopen, closings, proLaboreList] = await Promise.all([
    userCan("financeiro", "fechar"),
    userCan("financeiro", "reabrir"),
    getClosedMonths(),
    prisma.capitalBeneficiary.findMany({
      where: { includeInMonthlyClosing: true, active: true, isCompany: false, proLabore: { gt: 0 } },
      select: { id: true, name: true, proLabore: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Próximo mês a fechar: o seguinte ao último fechado; sem fechamentos, o
  // PRIMEIRO mês com movimento (início do exercício — meses vazios antes do
  // sistema começar não contam). Nada a fazer enquanto o mês não terminar.
  const now = new Date();
  const latest = closings[0] ?? null;
  let nextYear: number | null = null;
  let nextMonth: number | null = null;
  if (latest) {
    nextYear = latest.month === 12 ? latest.year + 1 : latest.year;
    nextMonth = latest.month === 12 ? 1 : latest.month + 1;
  } else {
    const first = await getFirstMovementMonth();
    if (first) {
      nextYear = first.year;
      nextMonth = first.month;
    }
  }
  const currentKey = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  const nextLabel = nextYear != null && nextMonth != null ? monthLabelBR(nextYear, nextMonth) : null;
  // O mês em exercício (atual) já pode ser fechado — inclui `<= currentKey`.
  // Só um mês futuro (nextKey > currentKey, ex.: logo após fechar o mês atual)
  // não é oferecido.
  const next =
    nextYear != null && nextMonth != null && nextYear * 12 + nextMonth <= currentKey
      ? { year: nextYear, month: nextMonth, label: monthLabelBR(nextYear, nextMonth) }
      : null;
  const nextIsClosable = next != null;
  const isCurrentMonth = next != null && next.year * 12 + next.month === currentKey;
  const nextResult = next ? await getMonthResult(next.year, next.month) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Fechamento Mensal"
        description="Ao fechar, o resultado do mês vai para o capital da empresa, o pró-labore é creditado e o mês fica travado"
        action={<LinkButton variant="secondary" href="/financeiro/contas">← Contas e caixas</LinkButton>}
      />

      <Card className="mb-4">
        <CardHeader
          title={nextIsClosable ? `Mês a fechar: ${nextLabel}` : "Tudo em dia"}
          description={
            nextIsClosable
              ? isCurrentMonth
                ? "Você pode fechar o mês em andamento agora — o resultado considera tudo o que já foi lançado, como se fosse o último dia do mês."
                : "Confira o resultado apurado antes de fechar."
              : nextLabel
                ? "Todos os meses com movimento já foram fechados."
                : "Ainda não há movimento no sistema — o primeiro fechamento aparece aqui quando houver."
          }
        />
        {next ? (
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Resultado do mês {nextLabel}
              </span>
              <span className={`text-2xl font-black ${nextResult >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatCurrency(nextResult)}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Ao fechar: {nextResult >= 0 ? "o lucro vira APORTE" : "o prejuízo vira RETIRADA"} no capital
              da empresa; o Lucro/Prejuízo do mês passa a mostrar R$ 0,00 (foi para o capital); e
              lançamentos com data em {nextLabel}
              {isCurrentMonth ? " (inclusive nos dias restantes do mês)" : ""} ficam bloqueados.
              {" "}O saldo devedor dos sócios <strong>não</strong> é coberto.
              {isCurrentMonth
                ? " Precisou lançar algo depois? É só reabrir o mês, lançar e fechar de novo."
                : ""}
            </p>
            {proLaboreList.length > 0 ? (
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="mb-1 font-medium text-slate-800">Pró-labore creditado neste fechamento:</p>
                {proLaboreList.map((b) => (
                  <p key={b.id} className="text-slate-600">
                    {b.name} — {formatCurrency(b.proLabore)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Nenhum sócio marcado para pró-labore no fechamento (marque na ficha do beneficiário, em
                Capital dos sócios).
              </p>
            )}
            {canClose ? (
              <CloseMonthButton
                year={next.year}
                month={next.month}
                label={next.label}
                resultLabel={formatCurrency(nextResult)}
              />
            ) : (
              <p className="text-sm text-slate-500">Você não tem permissão para fechar o mês.</p>
            )}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Meses fechados" description="Do mais recente para o mais antigo — só o mais recente pode ser reaberto" />
        {closings.length === 0 ? (
          <EmptyState title="Nenhum mês fechado ainda" description="O primeiro fechamento aparece aqui." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Competência</Th>
                <Th className="text-right">Resultado</Th>
                <Th>Fechado por</Th>
                <Th>Em</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {closings.map((c, i) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-slate-900">{monthLabelBR(c.year, c.month)}</Td>
                  <Td className="text-right tabular-nums">
                    <Badge tone={c.result >= 0 ? "success" : "danger"}>{formatCurrency(c.result)}</Badge>
                  </Td>
                  <Td>{c.closedBy || "—"}</Td>
                  <Td className="whitespace-nowrap">{formatDate(c.closedAt)}</Td>
                  <Td>
                    {i === 0 && canReopen ? (
                      <ReopenMonthButton year={c.year} month={c.month} label={monthLabelBR(c.year, c.month)} />
                    ) : null}
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
