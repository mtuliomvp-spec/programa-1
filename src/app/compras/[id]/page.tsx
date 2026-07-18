import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { formatCurrency, formatDate, formatRequestNumber } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import RequestDetailActions from "./RequestDetailActions";

export const dynamic = "force-dynamic";

const statusMeta = {
  PENDENTE: { label: "Aguardando aprovação", tone: "warning" },
  APROVADA: { label: "Aprovada", tone: "info" },
  REJEITADA: { label: "Rejeitada", tone: "danger" },
  CONCLUIDA: { label: "Concluída", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "default" },
} as const;

const flowName = (key?: string | null) =>
  STRUCTURAL_FLOWS.find((f) => f.key === key)?.name ?? "Administrativo";

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-3">
      <p className="w-48 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

export default async function SolicitacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("compras");
  const { id } = await params;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { supplier: true, vehicle: true, capitalBeneficiary: true },
  });
  if (!request) notFound();

  const payable = request.payableId
    ? await prisma.payable.findUnique({
        where: { id: request.payableId },
        include: { account: true },
      })
    : null;

  const [canApprove, canCreate, stockVehicles, beneficiaries, suppliers] = await Promise.all([
    userCan("compras", "aprovar"),
    userCan("compras", "criar"),
    prisma.vehicle.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: { id: true, brand: true, model: true, plate: true, status: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const vehicles = stockVehicles.map((v) => ({
    id: v.id,
    label: `${v.brand} ${v.model} · ${v.plate}${v.status === "VENDIDO" ? " (vendido)" : ""}`,
  }));

  const meta = statusMeta[request.status];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Solicitação ${formatRequestNumber(request.seq, request.year)}`}
        description={request.description}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <LinkButton href="/compras" variant="secondary">
              ← Voltar
            </LinkButton>
          </div>
        }
      />

      <Card className="p-5">
        <Linha label="O que comprar">{request.description}</Linha>
        {request.details ? <Linha label="Detalhes / justificativa">{request.details}</Linha> : null}
        <Linha label="Solicitante">{request.requestedBy}</Linha>
        <Linha label="Data do pedido">{formatDate(request.createdAt)}</Linha>
        <Linha label="Fluxo">{flowName(request.structuralKey)}</Linha>
        {request.vehicle ? (
          <Linha label="Veículo">
            {request.vehicle.brand} {request.vehicle.model} · {request.vehicle.plate}
          </Linha>
        ) : null}
        {request.capitalBeneficiary ? (
          <Linha label="Beneficiário">{request.capitalBeneficiary.name}</Linha>
        ) : null}
        {request.supplier ? <Linha label="Fornecedor">{request.supplier.name}</Linha> : null}
        <Linha label="Valor estimado">
          {request.estimatedAmount ? formatCurrency(request.estimatedAmount) : "—"}
        </Linha>
        {request.finalAmount ? (
          <Linha label="Valor final">{formatCurrency(request.finalAmount)}</Linha>
        ) : null}
        {request.decidedBy ? (
          <Linha label="Decisão">
            {meta.label} por {request.decidedBy}
            {request.decidedAt ? ` em ${formatDate(request.decidedAt)}` : ""}
            {request.decisionNotes ? ` — ${request.decisionNotes}` : ""}
          </Linha>
        ) : null}
      </Card>

      {/* Ações conforme o status (aprovar/rejeitar/cancelar/concluir). */}
      {request.status === "PENDENTE" || request.status === "APROVADA" ? (
        <Card className="mt-4">
          <CardHeader
            title={request.status === "APROVADA" ? "Concluir compra" : "Decisão"}
            description={
              request.status === "APROVADA"
                ? "Ao concluir, a conta entra em Contas a pagar."
                : undefined
            }
          />
          <div className="p-5">
            <RequestDetailActions
              id={request.id}
              status={request.status}
              structuralKey={request.structuralKey}
              vehicleId={request.vehicleId}
              capitalBeneficiaryId={request.capitalBeneficiaryId}
              supplierId={request.supplierId}
              vehicles={vehicles}
              beneficiaries={beneficiaries}
              suppliers={suppliers}
              canApprove={canApprove}
              canCreate={canCreate}
            />
          </div>
        </Card>
      ) : null}

      {/* Já concluída: mostra a conta a pagar gerada e o link para ela. */}
      {payable ? (
        <Card className="mt-4">
          <CardHeader title="Conta a pagar gerada" description="Lançada no financeiro a partir desta compra" />
          <div className="space-y-1 p-5 text-sm text-slate-700">
            <p>
              <span className="font-medium text-slate-900">{formatCurrency(payable.amount)}</span>{" "}
              <Badge tone={payable.status === "PAGO" ? "success" : "warning"}>
                {payable.status === "PAGO" ? "Pago" : "Pendente"}
              </Badge>
            </p>
            <p className="text-slate-500">
              Vencimento {formatDate(payable.dueDate)}
              {payable.paymentDate ? ` · pago em ${formatDate(payable.paymentDate)}` : ""}
              {payable.account ? ` · ${payable.account.name}` : ""}
            </p>
            <Link href="/financeiro/a-pagar" className="inline-block pt-1 font-medium text-blue-700 hover:underline">
              Abrir em Contas a pagar →
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
