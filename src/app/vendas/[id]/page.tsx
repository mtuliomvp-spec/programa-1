import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import CancelSaleButton from "./CancelSaleButton";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;
const statusTone = { CONCLUIDA: "success", CANCELADA: "danger" } as const;
const statusLabel = { CONCLUIDA: "Concluída", CANCELADA: "Cancelada" } as const;
const recTone = { PENDENTE: "warning", RECEBIDO: "success", ATRASADO: "danger" } as const;
const recLabel = { PENDENTE: "Pendente", RECEBIDO: "Recebido", ATRASADO: "Atrasado" } as const;

export default async function VendaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      vehicle: true,
      tradeInVehicle: true,
      customer: true,
      receivables: { orderBy: { installmentNumber: "asc" } },
    },
  });

  if (!sale) notFound();

  const totalRecebido = sale.receivables.filter((r) => r.status === "RECEBIDO").reduce((s, r) => s + r.amount, 0);
  // Venda cancelada que ainda tem lançamentos vinculados (cancelada por uma
  // versão antiga que não revertia tudo): oferece corrigir e limpar os resíduos.
  const cancelamentoResidual =
    sale.status === "CANCELADA" && (sale.receivables.length > 0 || !!sale.tradeInVehicleId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Venda - ${sale.vehicle.brand} ${sale.vehicle.model}`}
        description={`Cliente: ${sale.customer.name} · ${formatDate(sale.saleDate)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[sale.status]}>{statusLabel[sale.status]}</Badge>
            <LinkButton href={`/vendas/${sale.id}/documento`} variant="secondary">
              📄 Ordem de venda
            </LinkButton>
            {sale.tradeInVehicle ? (
              <LinkButton href={`/vendas/${sale.id}/troca`} variant="secondary">
                🔁 Documento de troca
              </LinkButton>
            ) : null}
            {sale.status === "CONCLUIDA" ? <CancelSaleButton id={sale.id} /> : null}
            {cancelamentoResidual ? <CancelSaleButton id={sale.id} mode="fix" /> : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor da venda</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(sale.totalAmount)}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Forma de pagamento</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{paymentLabel[sale.paymentMethod]}</p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Já recebido</p>
          <p className="mt-2 text-xl font-semibold text-emerald-600">{formatCurrency(totalRecebido)}</p>
        </Card>
      </div>

      {sale.returnLevel > 0 && sale.returnNet > 0 ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 px-5 py-3 text-sm text-emerald-800">
          <strong>Retorno da financeira R-{String(sale.returnLevel).padStart(2, "0")}</strong>: líquido{" "}
          {formatCurrency(sale.returnNet)}{" "}
          {sale.returnSettledAt
            ? `· recebido em ${formatDate(sale.returnSettledAt)}`
            : "· a receber da financeira (tela Financiamentos)"}
          .
        </div>
      ) : null}

      <div className="mt-4">
        <Card>
          <CardHeader title="Contas a receber geradas" description="Parcelas e valores vinculados a esta venda" />
          <Table>
            <Thead>
              <Tr>
                <Th>Descrição</Th>
                <Th>Vencimento</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <tbody>
              {sale.receivables.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.description}</Td>
                  <Td>{formatDate(r.dueDate)}</Td>
                  <Td>{formatCurrency(r.amount)}</Td>
                  <Td>
                    <Badge tone={recTone[r.status]}>{recLabel[r.status]}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {sale.sellerName || sale.notes ? (
        <div className="mt-4">
          <Card className="p-5 text-sm text-slate-600">
            {sale.sellerName ? <p><span className="font-medium text-slate-800">Vendedor:</span> {sale.sellerName}</p> : null}
            {sale.notes ? <p className="mt-1"><span className="font-medium text-slate-800">Observações:</span> {sale.notes}</p> : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
