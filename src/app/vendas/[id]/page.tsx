import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import CancelSaleButton from "./CancelSaleButton";
import { userCan } from "@/lib/guards";

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

  // Só quem tem a permissão "Cancelar venda" vê o botão (a ação também é
  // bloqueada no servidor).
  const canCancel = await userCan("vendas", "cancelar");

  const totalRecebido = sale.receivables.filter((r) => r.status === "RECEBIDO").reduce((s, r) => s + r.amount, 0);
  const referrals = parseReferrals(sale.referrals);
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
            <LinkButton href={`/vendas/${sale.id}/contrato`} variant="secondary">
              📝 Contrato de venda
            </LinkButton>
            {sale.tradeInVehicle ? (
              <LinkButton href={`/vendas/${sale.id}/troca`} variant="secondary">
                🔁 Documento de troca
              </LinkButton>
            ) : null}
            {canCancel && sale.status === "CONCLUIDA" ? <CancelSaleButton id={sale.id} /> : null}
            {canCancel && cancelamentoResidual ? <CancelSaleButton id={sale.id} mode="fix" /> : null}
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

      {sale.sellerName || sale.commissionAmount > 0 || referrals.length > 0 || (sale.transferCharged && sale.transferAmount > 0) || sale.returnCommissionAmount > 0 || sale.viaPaidTraffic || sale.notes ? (
        <div className="mt-4">
          <Card className="p-5 text-sm text-slate-600">
            {sale.sellerName ? <p><span className="font-medium text-slate-800">Vendedor:</span> {sale.sellerName}</p> : null}
            {sale.commissionAmount > 0 ? (
              <p className="mt-1">
                <span className="font-medium text-slate-800">Comissão do vendedor:</span> {formatCurrency(sale.commissionAmount)}{" "}
                <span className="text-slate-400">— lançada em Contas a pagar (Comissão)</span>
              </p>
            ) : null}
            {sale.transferCharged && sale.transferAmount > 0 ? (
              <p className="mt-1">
                <span className="font-medium text-slate-800">Transferência (DETRAN):</span> {formatCurrency(sale.transferAmount)}{" "}
                <span className="text-slate-400">— lançada em Contas a pagar</span>
              </p>
            ) : null}
            {sale.returnCommissionAmount > 0 ? (
              <p className="mt-1">
                <span className="font-medium text-slate-800">Comissão do retorno:</span> {formatCurrency(sale.returnCommissionAmount)}{" "}
                <span className="text-slate-400">— lançada em Contas a pagar (Comissão)</span>
              </p>
            ) : null}
            {referrals.map((r, i) => (
              <p key={i} className="mt-1">
                <span className="font-medium text-slate-800">Indicação de venda{referrals.length > 1 ? ` ${i + 1}` : ""}:</span>{" "}
                {r.name || "—"}{r.amount > 0 ? <> — {formatCurrency(r.amount)}{" "}
                <span className="text-slate-400">— lançada em Contas a pagar (Comissão)</span></> : null}
              </p>
            ))}
            {sale.viaPaidTraffic ? (
              <p className="mt-1">
                <span className="font-medium text-slate-800">Tráfego pago:</span> venda originada de anúncio{" "}
                <span className="text-slate-400">— o lucro líquido abate o card do dashboard</span>
              </p>
            ) : null}
            {sale.notes ? <p className="mt-1"><span className="font-medium text-slate-800">Observações:</span> {sale.notes}</p> : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
