import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated, ensureConsortiumInstallments } from "@/lib/recurring";
import { getActiveAccounts } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { matchesSearch } from "@/lib/search";
import { Card, EmptyState, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import PayablesTable, { type PayableRow } from "./PayablesTable";

export const dynamic = "force-dynamic";

const categoryLabel = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  OUTROS: "Outros",
} as const;

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: statusFilter, q: qParam } = await searchParams;
  const q = (qParam || "").trim();
  await ensureRecurringGenerated();
  await ensureConsortiumInstallments();

  const [payables, accounts] = await Promise.all([
    prisma.payable.findMany({
      orderBy: { dueDate: "asc" },
      include: { supplier: true, vehicle: true, part: true, account: { select: { name: true } } },
    }),
    getActiveAccounts(),
  ]);

  const withStatus = payables.map((p) => ({ ...p, effective: effectivePayableStatus(p.status, p.dueDate) }));
  const filtered = statusFilter && statusFilter !== "TODOS" ? withStatus.filter((p) => p.effective === statusFilter) : withStatus;

  const totalPendente = withStatus.filter((p) => p.effective !== "PAGO").reduce((s, p) => s + p.amount, 0);
  const totalAtrasado = withStatus.filter((p) => p.effective === "ATRASADO").reduce((s, p) => s + p.amount, 0);

  const mappedRows: PayableRow[] = filtered.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    description: p.description,
    categoryLabel: p.categoryLabel || categoryLabel[p.category],
    documentNumber: p.documentNumber ?? null,
    supplierName: p.supplier?.name ?? null,
    vehicleLabel: p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model} · ${p.vehicle.plate}` : null,
    dueDate: p.dueDate.toISOString(),
    amount: p.amount,
    effective: p.effective,
    status: p.status,
    accountName: p.account?.name ?? null,
    recurring: Boolean(p.recurringId),
  }));

  // Busca livre pelos campos exibidos (nº, descrição, categoria, fornecedor,
  // veículo, vencimento, valor, status, conta).
  const statusText = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;
  const tableRows = q
    ? mappedRows.filter((r) =>
        matchesSearch(
          q,
          String(r.orderNumber).padStart(4, "0"),
          r.description,
          r.documentNumber,
          r.categoryLabel,
          r.supplierName,
          r.vehicleLabel,
          formatDate(r.dueDate),
          r.amount,
          formatCurrency(r.amount),
          statusText[r.effective],
          r.accountName,
        ),
      )
    : mappedRows;

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={<LinkButton href="/financeiro/a-pagar/novo">+ Nova conta</LinkButton>}
      />

      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm">
            <Input name="q" defaultValue={q} placeholder="Buscar em todos os campos (descrição, fornecedor, veículo, valor...)" />
          </div>
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
          {q ? (
            <LinkButton variant="secondary" href="/financeiro/a-pagar">
              Limpar
            </LinkButton>
          ) : null}
        </form>
      </Card>

      <Card>
        {tableRows.length === 0 ? (
          <EmptyState title={q ? "Nada encontrado para a busca" : "Nenhuma conta a pagar encontrada"} />
        ) : (
          <>
            <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
              Marque um ou vários títulos, escolha a conta e pague de uma vez (em lote).
            </p>
            <PayablesTable rows={tableRows} accounts={accounts} />
          </>
        )}
      </Card>
    </div>
  );
}
