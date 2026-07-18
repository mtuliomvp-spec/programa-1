import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { getActiveAccounts } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveReceivableStatus } from "@/lib/status";
import { matchesSearch } from "@/lib/search";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReceivableRowActions from "./ReceivableRowActions";

export const dynamic = "force-dynamic";

const categoryLabel = { VENDA_VEICULO: "Venda de veículo", VENDA_PECA: "Venda de peça", RETORNO_FINANCEIRA: "Retorno financeira", OUTROS: "Outros" } as const;
const statusTone = { PENDENTE: "warning", RECEBIDO: "success", ATRASADO: "danger" } as const;
const statusLabelMap = { PENDENTE: "Pendente", RECEBIDO: "Recebido", ATRASADO: "Atrasado" } as const;

export default async function ContasAReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: statusFilter, q: qParam } = await searchParams;
  const q = (qParam || "").trim();
  await ensureRecurringGenerated();

  const [receivables, accounts] = await Promise.all([
    prisma.receivable.findMany({
      orderBy: { dueDate: "asc" },
      include: { customer: true, account: { select: { name: true } } },
    }),
    getActiveAccounts(),
  ]);

  const withStatus = receivables.map((r) => ({ ...r, effective: effectiveReceivableStatus(r.status, r.dueDate) }));
  const byStatus = statusFilter && statusFilter !== "TODOS" ? withStatus.filter((r) => r.effective === statusFilter) : withStatus;
  // Busca livre pelos campos exibidos.
  const filtered = q
    ? byStatus.filter((r) =>
        matchesSearch(
          q,
          r.description,
          categoryLabel[r.category],
          r.customer?.name,
          formatDate(r.dueDate),
          r.amount,
          formatCurrency(r.amount),
          statusLabelMap[r.effective],
          r.account?.name,
        ),
      )
    : byStatus;

  const totalPendente = withStatus.filter((r) => r.effective !== "RECEBIDO").reduce((s, r) => s + r.amount, 0);
  const totalAtrasado = withStatus.filter((r) => r.effective === "ATRASADO").reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Contas a receber"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={<LinkButton href="/financeiro/a-receber/novo">+ Nova conta</LinkButton>}
      />

      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <Input name="q" defaultValue={q} placeholder="Buscar em todos os campos (descrição, cliente, valor...)" />
          </div>
          <div className="w-56">
            <Select name="status" defaultValue={statusFilter || "TODOS"}>
              <option value="TODOS">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="ATRASADO">Atrasado</option>
              <option value="RECEBIDO">Recebido</option>
            </Select>
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Filtrar
          </button>
          {q ? (
            <LinkButton variant="secondary" href="/financeiro/a-receber">
              Limpar
            </LinkButton>
          ) : null}
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title={q ? "Nada encontrado para a busca" : "Nenhuma conta a receber encontrada"} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th>Cliente</Th>
                <Th>Vencimento</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {filtered.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-slate-900">{r.description}</Td>
                  <Td>{categoryLabel[r.category]}</Td>
                  <Td>{r.customer?.name || "-"}</Td>
                  <Td>{formatDate(r.dueDate)}</Td>
                  <Td>{formatCurrency(r.amount)}</Td>
                  <Td>
                    <Badge tone={statusTone[r.effective]}>{statusLabelMap[r.effective]}</Badge>
                  </Td>
                  <Td>
                    <ReceivableRowActions id={r.id} status={r.status} amount={r.amount} accounts={accounts} />
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
