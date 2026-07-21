import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { formatCurrency, formatDate, formatRequestNumber } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, Input, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import NewRequestForm from "./NewRequestForm";
import RequestRowActions from "./RequestRowActions";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";

export const dynamic = "force-dynamic";

const flowName = (key?: string | null) =>
  STRUCTURAL_FLOWS.find((f) => f.key === key)?.name ?? null;

const statusMeta = {
  PENDENTE: { label: "Aguardando aprovação", tone: "warning" },
  APROVADA: { label: "Aprovada", tone: "info" },
  REJEITADA: { label: "Rejeitada", tone: "danger" },
  CONCLUIDA: { label: "Concluída", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "default" },
} as const;

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  const [user, allRequests, suppliers, stockVehicles, beneficiaries] = await Promise.all([
    getSessionUser(),
    prisma.purchaseRequest.findMany({
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicle.findMany({
      where: { status: "ESTOQUE", intermediation: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, brand: true, model: true, plate: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const vehicles = stockVehicles.map((v) => ({
    id: v.id,
    label: `${v.brand} ${v.model} · ${v.plate}`,
  }));

  // Busca livre pelos campos exibidos.
  const requests = q
    ? allRequests.filter((r) =>
        matchesSearch(
          q,
          formatRequestNumber(r.seq, r.year),
          r.description,
          r.requestedBy,
          formatDate(r.createdAt),
          flowName(r.structuralKey),
          r.supplier?.name,
          r.decisionNotes,
          r.finalAmount,
          r.finalAmount ? formatCurrency(r.finalAmount) : null,
          r.estimatedAmount,
          r.estimatedAmount ? formatCurrency(r.estimatedAmount) : null,
          statusMeta[r.status].label,
        ),
      )
    : allRequests;

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
          <form className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <div className="w-full max-w-sm">
              <Input name="q" defaultValue={q} placeholder="Buscar em todos os campos (descrição, fornecedor, valor...)" />
            </div>
            <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Buscar
            </button>
            {q ? <LinkButton variant="secondary" href="/compras">Limpar</LinkButton> : null}
          </form>
          {requests.length === 0 ? (
            <EmptyState
              title={q ? "Nada encontrado para a busca" : "Nenhuma solicitação"}
              description={q ? "Tente outros termos ou limpe a busca." : "Registre a primeira solicitação de compra ao lado."}
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
                    <Td className="whitespace-nowrap tabular-nums text-slate-500">
                      <Link href={`/compras/${r.id}`} className="text-blue-700 hover:underline">
                        {formatRequestNumber(r.seq, r.year)}
                      </Link>
                    </Td>
                    <Td className="max-w-[260px] font-medium text-slate-900">
                      <Link href={`/compras/${r.id}`} className="block hover:underline">
                        <span className="block truncate">{r.description}</span>
                        <span className="block truncate text-xs font-normal text-slate-400">
                          {formatDate(r.createdAt)}
                          {flowName(r.structuralKey) ? ` · ${flowName(r.structuralKey)}` : ""}
                          {r.supplier ? ` · ${r.supplier.name}` : ""}
                          {r.decisionNotes ? ` · ${r.decisionNotes}` : ""}
                        </span>
                      </Link>
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
                      <RequestRowActions
                        id={r.id}
                        status={r.status}
                        isAdmin={isAdmin}
                        structuralKey={r.structuralKey}
                      />
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
            <NewRequestForm suppliers={suppliers} vehicles={vehicles} beneficiaries={beneficiaries} />
          </div>
        </Card>
      </div>
    </div>
  );
}
