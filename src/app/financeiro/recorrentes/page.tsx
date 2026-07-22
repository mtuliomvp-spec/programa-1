import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { formatCurrency } from "@/lib/format";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import RecurringRowActions from "./RecurringRowActions";

export const dynamic = "force-dynamic";

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

  const allEntries = await prisma.recurringEntry.findMany({
    include: { supplier: true, customer: true },
    orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }],
  });
  const entries = allEntries.filter(
    (e) =>
      matchesSearch(
        q,
        e.description,
        categoryLabel[e.categoryPagar ?? e.categoryReceber ?? "OUTROS"],
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
        action={<LinkButton href="/financeiro/recorrentes/novo">+ Nova recorrência</LinkButton>}
      />

      <Card className="mb-4 border-blue-200 bg-blue-50/60 px-4 py-3 print:hidden">
        <p className="text-sm text-slate-600">
          As contas do mês são geradas automaticamente ao abrir o financeiro — sem duplicar. Ao
          desativar uma recorrência, as contas já geradas permanecem; apenas os próximos meses param.
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
            action={<LinkButton href="/financeiro/recorrentes/novo">+ Nova recorrência</LinkButton>}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Descrição</Th>
                <Th>Tipo</Th>
                <Th>Categoria</Th>
                <Th>Quem</Th>
                <Th className="text-right">Dia</Th>
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
                  <Td>{categoryLabel[e.categoryPagar ?? e.categoryReceber ?? "OUTROS"]}</Td>
                  <Td>{e.supplier?.name || e.customer?.name || "-"}</Td>
                  <Td className="text-right tabular-nums">dia {e.dayOfMonth}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(e.amount)}</Td>
                  <Td>
                    <Badge tone={e.active ? "success" : "default"}>
                      {e.active ? "Ativa" : "Pausada"}
                    </Badge>
                  </Td>
                  <Td>
                    <RecurringRowActions id={e.id} active={e.active} />
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
