import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import NewRequestForm from "./NewRequestForm";
import RequestRowActions from "./RequestRowActions";

export const dynamic = "force-dynamic";

const statusMeta = {
  PENDENTE: { label: "Aguardando aprovação", tone: "warning" },
  APROVADA: { label: "Aprovada", tone: "info" },
  REJEITADA: { label: "Rejeitada", tone: "danger" },
  CONCLUIDA: { label: "Concluída", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "default" },
} as const;

export default async function ComprasPage() {
  const [user, requests, suppliers] = await Promise.all([
    getSessionUser(),
    prisma.purchaseRequest.findMany({
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const pendentes = requests.filter((r) => r.status === "PENDENTE");
  const aprovadas = requests.filter((r) => r.status === "APROVADA");
  const isAdmin = user?.role === "ADMIN";

  return (
    <div>
      <PageHeader
        title="Solicitações de compra"
        description="Peça, o administrador aprova, e a conclusão lança direto no financeiro"
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Aguardando aprovação"
          value={String(pendentes.length)}
          tone={pendentes.length > 0 ? "warning" : "default"}
        />
        <StatCard label="Aprovadas (a comprar)" value={String(aprovadas.length)} />
        <StatCard
          label="Valor estimado pendente"
          value={formatCurrency(
            [...pendentes, ...aprovadas].reduce((s, r) => s + (r.estimatedAmount ?? 0), 0),
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Solicitações" description="Últimas 100" />
          {requests.length === 0 ? (
            <EmptyState
              title="Nenhuma solicitação"
              description="Registre a primeira solicitação de compra ao lado."
            />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Nº</Th>
                  <Th>Descrição</Th>
                  <Th>Solicitante</Th>
                  <Th className="text-right">Valor</Th>
                  <Th>Status</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {requests.map((r) => (
                  <Tr key={r.id}>
                    <Td className="tabular-nums text-slate-500">#{r.number}</Td>
                    <Td className="max-w-[260px] font-medium text-slate-900">
                      <p className="truncate">{r.description}</p>
                      <p className="truncate text-xs font-normal text-slate-400">
                        {formatDate(r.createdAt)}
                        {r.supplier ? ` · ${r.supplier.name}` : ""}
                        {r.decisionNotes ? ` · ${r.decisionNotes}` : ""}
                      </p>
                    </Td>
                    <Td>{r.requestedBy}</Td>
                    <Td className="text-right tabular-nums">
                      {r.finalAmount
                        ? formatCurrency(r.finalAmount)
                        : r.estimatedAmount
                          ? `~${formatCurrency(r.estimatedAmount)}`
                          : "—"}
                    </Td>
                    <Td>
                      <Badge tone={statusMeta[r.status].tone}>{statusMeta[r.status].label}</Badge>
                    </Td>
                    <Td>
                      <RequestRowActions id={r.id} status={r.status} isAdmin={isAdmin} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Nova solicitação" />
          <div className="p-5">
            <NewRequestForm suppliers={suppliers} />
          </div>
        </Card>
      </div>
    </div>
  );
}
