import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { formatCurrency, formatDate, formatRequestNumber } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { getActiveAccounts } from "@/lib/accounts";
import { getCashboxState } from "@/lib/cashbox";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import RequestDetailActions from "./RequestDetailActions";
import RequestPayables from "./RequestPayables";

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

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    include: {
      supplier: true,
      vehicle: true,
      capitalBeneficiary: true,
      attachments: {
        orderBy: { createdAt: "desc" },
        select: { id: true, filename: true, size: true },
      },
      payables: {
        orderBy: { dueDate: "asc" },
        include: { account: { select: { name: true } } },
      },
    },
  });
  if (!request) notFound();

  const [canApprove, canCreate, canPay, activeAccounts, cashbox] = await Promise.all([
    userCan("compras", "aprovar"),
    userCan("compras", "criar"),
    userCan("financeiro", "pagar"),
    getActiveAccounts(),
    getCashboxState(),
  ]);

  const payableRows = request.payables.map((p) => ({
    id: p.id,
    description: p.description,
    amount: p.amount,
    dueDate: p.dueDate.toISOString(),
    status: effectivePayableStatus(p.status, p.dueDate),
    documentNumber: p.documentNumber,
    paymentDate: p.paymentDate ? p.paymentDate.toISOString() : null,
    accountName: p.account?.name ?? null,
  }));
  const accounts = activeAccounts.map((a) => ({ id: a.id, name: a.name }));

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
        <Linha label="Valor">
          {request.estimatedAmount ? formatCurrency(request.estimatedAmount) : "—"}
          {request.installmentsCount > 1 ? ` · ${request.installmentsCount}x` : ""}
        </Linha>
        {request.dueDate ? <Linha label="Vencimento">{formatDate(request.dueDate)}</Linha> : null}
        {request.documentNumber ? <Linha label="Nº NF/Doc">{request.documentNumber}</Linha> : null}
        {request.attachments.length > 0 ? (
          <Linha label="Anexo">
            <ul className="space-y-1.5">
              {request.attachments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-700">
                    {a.filename} · {humanSize(a.size)}
                  </span>
                  <a
                    href={`/compras/anexos/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Abrir
                  </a>
                  <a
                    href={`/compras/anexos/${a.id}?download=1`}
                    className="font-medium text-slate-600 hover:underline"
                  >
                    Baixar
                  </a>
                </li>
              ))}
            </ul>
          </Linha>
        ) : null}
        {request.decidedBy ? (
          <Linha label="Decisão">
            {meta.label} por {request.decidedBy}
            {request.decidedAt ? ` em ${formatDate(request.decidedAt)}` : ""}
            {request.decisionNotes ? ` — ${request.decisionNotes}` : ""}
          </Linha>
        ) : null}
      </Card>

      {/* Decisão (aprovar/rejeitar/cancelar) enquanto pendente. */}
      {request.status === "PENDENTE" ? (
        <Card className="mt-4">
          <CardHeader title="Decisão" description="Ao aprovar, o espelho entra em Contas a pagar." />
          <div className="p-5">
            <RequestDetailActions
              id={request.id}
              status={request.status}
              canApprove={canApprove}
              canCreate={canCreate}
            />
          </div>
        </Card>
      ) : null}

      {/* Espelho em Contas a pagar (1 título ou N parcelas), pagável por aqui. */}
      {payableRows.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Contas a pagar (espelho)"
            description="Gerado na aprovação. Pode ser pago aqui ou em Contas a pagar."
          />
          <div className="p-5">
            <RequestPayables
              payables={payableRows}
              accounts={accounts}
              canPay={canPay}
              cashboxOpen={cashbox.open}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
