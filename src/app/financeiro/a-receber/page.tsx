import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureRecurringGeneratedForPage } from "@/lib/recurring";
import { getActiveAccounts } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveReceivableStatus } from "@/lib/status";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Select, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import ReceivableRowActions from "./ReceivableRowActions";
import DeleteReceivableButton from "./DeleteReceivableButton";

export const dynamic = "force-dynamic";

const categoryLabel = { VENDA_VEICULO: "Venda de veículo", VENDA_PECA: "Venda de peça", RETORNO_FINANCEIRA: "Retorno financeira", OUTROS: "Outros" } as const;
const statusTone = { PENDENTE: "warning", RECEBIDO: "success", ATRASADO: "danger" } as const;
const statusLabelMap = { PENDENTE: "Pendente", RECEBIDO: "Recebido", ATRASADO: "Atrasado" } as const;

export default async function ContasAReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const { status: statusFilter, q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const [canReceber, canManage, canEditOnly] = await Promise.all([
    userCan("financeiro", "receber"),
    userCan("financeiro", "criar"),
    userCan("financeiro", "editar"),
  ]);
  // Link "Editar" da linha: lançadores OU quem tem só a permissão de editar.
  const canEdit = canManage || canEditOnly;
  await ensureRecurringGeneratedForPage();

  const [receivables, accounts] = await Promise.all([
    prisma.receivable.findMany({
      orderBy: { dueDate: "asc" },
      include: { customer: true, account: { select: { name: true } } },
    }),
    getActiveAccounts(),
  ]);

  const withStatus = receivables.map((r) => ({ ...r, effective: effectiveReceivableStatus(r.status, r.dueDate) }));
  const byStatus = statusFilter && statusFilter !== "TODOS" ? withStatus.filter((r) => r.effective === statusFilter) : withStatus;
  // Busca livre + intervalo de vencimento + faixa de valor.
  const filtered = byStatus.filter(
    (r) =>
      matchesSearch(
        q,
        r.description,
        r.categoryLabel || categoryLabel[r.category],
        r.customer?.name,
        formatDate(r.dueDate),
        r.amount,
        formatCurrency(r.amount),
        statusLabelMap[r.effective],
        r.account?.name,
      ) &&
      inDateRange(r.dueDate, de, ate) &&
      inValueRange(r.amount, min, max),
  );
  // Igual a Contas a pagar: recebidos vão para o fim; atrasados e pendentes
  // primeiro (dentro de cada grupo, o vencimento asc já traz os atrasados antes).
  filtered.sort((a, b) => (a.effective === "RECEBIDO" ? 1 : 0) - (b.effective === "RECEBIDO" ? 1 : 0));

  const totalPendente = withStatus.filter((r) => r.effective !== "RECEBIDO").reduce((s, r) => s + r.amount, 0);
  const totalAtrasado = withStatus.filter((r) => r.effective === "ATRASADO").reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Contas a receber"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={
          <Can module="financeiro" action="criar">
            <LinkButton href="/financeiro/a-receber/novo">+ Nova conta</LinkButton>
          </Can>
        }
      />

      <ReportToolbar
        basePath="/financeiro/a-receber"
        printTitle="Contas a receber"
        q={q}
        placeholder="Buscar (descrição, cliente, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
        filtersKey={`${statusFilter ?? ""}`}
        extra={
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Status
            <Select name="status" defaultValue={statusFilter || "TODOS"} className="mt-0.5 w-48">
              <option value="TODOS">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="ATRASADO">Atrasado</option>
              <option value="RECEBIDO">Recebido</option>
            </Select>
          </label>
        }
      />

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
                  <Td>{r.categoryLabel || categoryLabel[r.category]}</Td>
                  <Td>{r.customer?.name || "-"}</Td>
                  <Td>{formatDate(r.dueDate)}</Td>
                  <Td>{formatCurrency(r.amount)}</Td>
                  <Td>
                    <Badge tone={statusTone[r.effective]}>{statusLabelMap[r.effective]}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      {canEdit && r.status !== "RECEBIDO" && !r.saleId && !r.partSaleId && !r.recurringId ? (
                        <Link
                          href={`/financeiro/a-receber/${r.id}/editar`}
                          className="text-sm font-medium text-blue-700 hover:underline"
                        >
                          Editar
                        </Link>
                      ) : null}
                      <ReceivableRowActions id={r.id} status={r.status} amount={r.amount} accounts={accounts} canReceber={canReceber} />
                      {canManage && r.status !== "RECEBIDO" && !r.saleId && !r.partSaleId && !r.recurringId ? (
                        <DeleteReceivableButton id={r.id} />
                      ) : null}
                    </div>
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
