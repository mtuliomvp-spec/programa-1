import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatRequestNumber } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan } from "@/lib/guards";
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
  searchParams: Promise<{ q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const { q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const [allRequests, suppliers, stockVehicles, beneficiaries] = await Promise.all([
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

  // Busca livre + intervalo de data + faixa de valor (final ou estimado).
  const requests = allRequests.filter(
    (r) =>
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
      ) &&
      inDateRange(r.createdAt, de, ate) &&
      inValueRange(r.finalAmount ?? r.estimatedAmount ?? 0, min, max),
  );

  const pendentes = requests.filter((r) => r.status === "PENDENTE");
  const aprovadas = requests.filter((r) => r.status === "APROVADA");
  const [canCreate, canApprove] = await Promise.all([
    userCan("compras", "criar"),
    userCan("compras", "aprovar"),
  ]);

  return (
    <div>
      <PageHeader
        title="Solicitações de compra"
        description="Peça, o administrador aprova, e a conclusão lança direto no financeiro"
      />

      <ReportToolbar
        basePath="/compras"
        printTitle="Solicitações de compra"
        q={q}
        placeholder="Buscar (descrição, fornecedor, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
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
                        canApprove={canApprove}
                        canCreate={canCreate}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canCreate ? (
          <Card className="h-fit print:hidden">
            <CardHeader title="Nova solicitação" />
            <div className="p-5">
              <NewRequestForm suppliers={suppliers} vehicles={vehicles} beneficiaries={beneficiaries} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
