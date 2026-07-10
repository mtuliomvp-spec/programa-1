import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated, ensureConsortiumInstallments } from "@/lib/recurring";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Select, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PayableRowActions from "./PayableRowActions";

export const dynamic = "force-dynamic";

const categoryLabel = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  OUTROS: "Outros",
} as const;

const statusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const statusLabelMap = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFilter } = await searchParams;
  await ensureRecurringGenerated();
  await ensureConsortiumInstallments();

  const payables = await prisma.payable.findMany({
    orderBy: { dueDate: "asc" },
    include: { supplier: true, vehicle: true, part: true },
  });

  const withStatus = payables.map((p) => ({ ...p, effective: effectivePayableStatus(p.status, p.dueDate) }));
  const filtered = statusFilter && statusFilter !== "TODOS" ? withStatus.filter((p) => p.effective === statusFilter) : withStatus;

  const totalPendente = withStatus.filter((p) => p.effective !== "PAGO").reduce((s, p) => s + p.amount, 0);
  const totalAtrasado = withStatus.filter((p) => p.effective === "ATRASADO").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={<LinkButton href="/financeiro/a-pagar/novo">+ Nova conta</LinkButton>}
      />

      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Select name="status" defaultValue={statusFilter || "TODOS"}>
              <option value="TODOS">Todos os status</option>
              <option value="PENDENTE">Pendente</option>
              <option value="ATRASADO">Atrasado</option>
              <option value="PAGO">Pago</option>
            </Select>
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="Nenhuma conta a pagar encontrada" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th>Fornecedor</Th>
                <Th>Vencimento</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {filtered.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">
                    {p.description}
                    {p.recurringId ? (
                      <span className="ml-1.5 text-xs text-slate-400" title="Gerada por recorrência">
                        🔁
                      </span>
                    ) : null}
                  </Td>
                  <Td>{categoryLabel[p.category]}</Td>
                  <Td>{p.supplier?.name || "-"}</Td>
                  <Td>{formatDate(p.dueDate)}</Td>
                  <Td>{formatCurrency(p.amount)}</Td>
                  <Td>
                    <Badge tone={statusTone[p.effective]}>{statusLabelMap[p.effective]}</Badge>
                  </Td>
                  <Td>
                    <PayableRowActions id={p.id} status={p.status} />
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
