import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { formatCurrency } from "@/lib/format";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan } from "@/lib/guards";
import RecurringRowActions from "./RecurringRowActions";
import GenerateNowButton from "./GenerateNowButton";

export const dynamic = "force-dynamic";

const flowLabel: Record<string, string> = {
  VEICULOS: "Veículos",
  ADMINISTRATIVO: "Administrativo",
  CAPITAL: "Capital",
};

const categoryLabel: Record<string, string> = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  VENDA_VEICULO: "Venda de veículo",
  VENDA_PECA: "Venda de peças",
  OUTROS: "Outros",
};

export default async function RecorrentesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string }>;
}) {
  await ensureRecurringGenerated();
  const { q: qParam, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const canCriar = await userCan("financeiro", "criar");

  const allEntries = await prisma.recurringEntry.findMany({
    include: { supplier: true, customer: true, capitalBeneficiary: true },
    orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }],
  });
  const entries = allEntries.filter(
    (e) =>
      matchesSearch(
        q,
        e.description,
        e.categoryLabel || categoryLabel[e.categoryPagar ?? e.categoryReceber ?? "OUTROS"],
        e.supplier?.name,
        e.customer?.name,
        e.kind === "PAGAR" ? "A pagar" : "A receber",
        e.dayOfMonth,
        e.amount,
        formatCurrency(e.amount),
      ) && inValueRange(e.amount, min, max),
  );

  const monthlyPagar = entries
    .filter((e) => e.active && e.kind === "PAGAR")
    .reduce((s, e) => s + e.amount, 0);
  const monthlyReceber = entries
    .filter((e) => e.active && e.kind === "RECEBER")
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="Lançamentos recorrentes"
        description={`Todo mês: ${formatCurrency(monthlyPagar)} a pagar · ${formatCurrency(monthlyReceber)} a receber`}
        action={
          canCriar ? (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <LinkButton href="/financeiro/recorrentes/importar" variant="secondary">
                ⇪ Importar do documento
              </LinkButton>
              <GenerateNowButton />
              <LinkButton href="/financeiro/recorrentes/novo">+ Nova recorrência</LinkButton>
            </div>
          ) : undefined
        }
      />

      <Card className="mb-4 border-blue-200 bg-blue-50/60 px-4 py-3 print:hidden">
        <p className="text-sm text-slate-600">
          Os títulos são gerados automaticamente <strong>15 dias antes do vencimento</strong> (ao abrir
          o financeiro) — sem duplicar. Use <strong>Gerar agora</strong> para antecipar. Ao desativar
          uma recorrência, os títulos já gerados permanecem; apenas os próximos param.
        </p>
      </Card>

      <ReportToolbar
        basePath="/financeiro/recorrentes"
        printTitle="Lançamentos recorrentes"
        q={q}
        placeholder="Buscar (descrição, categoria, quem, valor...)"
        value
        min={min}
        max={max}
      />

      <Card>
        {entries.length === 0 ? (
          <EmptyState
            title="Nenhuma recorrência cadastrada"
            description="Cadastre despesas e receitas fixas (aluguel, salários, assinaturas...) para o sistema lançar sozinho todo mês."
            action={
              canCriar ? (
                <LinkButton href="/financeiro/recorrentes/novo">+ Nova recorrência</LinkButton>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Descrição</Th>
                <Th>Tipo</Th>
                <Th>Fluxo</Th>
                <Th>Categoria</Th>
                <Th>Quem</Th>
                <Th className="text-right">Período</Th>
                <Th className="text-right">Valor</Th>
                <Th>Situação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {entries.map((e) => (
                <Tr key={e.id} className={!e.active ? "opacity-60" : undefined}>
                  <Td className="font-medium text-slate-900">{e.description}</Td>
                  <Td>
                    <Badge tone={e.kind === "PAGAR" ? "danger" : "info"}>
                      {e.kind === "PAGAR" ? "A pagar" : "A receber"}
                    </Badge>
                  </Td>
                  <Td>{flowLabel[e.structuralKey ?? "ADMINISTRATIVO"]}</Td>
                  <Td>
                    {e.structuralKey === "CAPITAL"
                      ? e.kind === "PAGAR"
                        ? "Retirada"
                        : "Aporte"
                      : e.categoryLabel || categoryLabel[e.categoryPagar ?? e.categoryReceber ?? "OUTROS"]}
                  </Td>
                  <Td>{e.capitalBeneficiary?.name || e.supplier?.name || e.customer?.name || "-"}</Td>
                  <Td className="text-right tabular-nums">
                    {e.intervalDays && e.intervalDays > 0 ? `a cada ${e.intervalDays} dias` : `dia ${e.dayOfMonth}`}
                    {e.anticipateToBusinessDay ? (
                      <span className="block text-xs font-normal text-slate-400">antecipa p/ dia útil</span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">{formatCurrency(e.amount)}</Td>
                  <Td>
                    {/* Término no passado: não gera mais nada — "Ativa" enganaria. */}
                    {e.active && e.endDate && e.endDate < new Date() ? (
                      <Badge tone="warning">Encerrada</Badge>
                    ) : (
                      <Badge tone={e.active ? "success" : "default"}>
                        {e.active ? "Ativa" : "Pausada"}
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    {canCriar ? <RecurringRowActions id={e.id} active={e.active} /> : null}
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
