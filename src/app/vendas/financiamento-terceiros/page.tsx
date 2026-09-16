import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/guards";
import { identificacaoVeiculo } from "./core";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import {
  houseNameKeys,
  situacaoDocumental,
  seloCrlv,
  type SituacaoDocumental,
} from "@/lib/doc-owner";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";

export const dynamic = "force-dynamic";

/**
 * Os MESMOS selos do veículo vendido do estoque. A operação financeira acaba no
 * dia, mas a documentação continua correndo: CRLV, orçamento do despachante,
 * comunicação de venda, foto do cliente e — o que mais importa — se o carro já
 * saiu do nome do dono anterior.
 */
function SelosDaOperacao({
  doc,
  refinancing,
  temTransferencia,
  className = "",
}: {
  doc: SituacaoDocumental;
  refinancing: boolean;
  /** A operação cobra transferência (há título do despachante a acertar). */
  temTransferencia: boolean;
  className?: string;
}) {
  const crlv = seloCrlv(doc);
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      <Badge tone={crlv.tone}>{crlv.label}</Badge>
      {doc.hasAtpv ? <Badge tone="success">✓ ATPV-e</Badge> : null}
      {doc.hasTransferQuote ? (
        <Badge tone="success">✓ Orçamento transf.</Badge>
      ) : temTransferencia ? (
        // Só cobra o orçamento quando a operação tem transferência: é o recibo
        // do despachante que acerta o título já lançado no Contas a pagar.
        <Badge tone="warning">⚠ Orçamento transf. pendente</Badge>
      ) : null}
      <Badge tone={doc.hasComunicacao ? "success" : "warning"}>
        {doc.hasComunicacao ? "✓ Comunicação de venda" : "⚠ Comunicação pendente"}
      </Badge>
      <Badge tone={doc.hasFotoCliente ? "success" : "warning"}>
        {doc.hasFotoCliente ? "✓ Foto do cliente" : "⚠ Foto do cliente pendente"}
      </Badge>
      {/* Refinanciamento não transfere nada: o veículo continua com o
          proprietário, que é o próprio financiado. */}
      {refinancing ? null : (
        <Badge tone={doc.transferDoneAt ? "success" : "danger"}>
          {doc.transferDoneAt
            ? doc.transferDoneByCrlv
              ? "✓ Transferido · CRLV no nome do comprador"
              : `✓ Transferido em ${formatDate(doc.transferDoneAt)}`
            : "⚠ No nome do dono anterior"}
        </Badge>
      )}
    </div>
  );
}

export default async function FinanciamentoTerceirosListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  await requireModule("vendas");
  const { q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();

  const [openPreRaw, opsRaw, houseKeys] = await Promise.all([
    prisma.preSale.findMany({
      where: { saleType: "FINANCIAMENTO_TERCEIROS", status: "ABERTA" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sale.findMany({
      where: { saleType: "FINANCIAMENTO_TERCEIROS" },
      orderBy: { saleDate: "desc" },
      include: {
        // O veículo é de terceiro, mas a documentação corre igual à de um
        // vendido do estoque: CRLV, orçamento do despachante, comunicação de
        // venda, foto do cliente e a transferência de propriedade. Quem
        // responde por tudo isso são os anexos, custos e títulos do carro.
        vehicle: {
          include: {
            attachments: { select: { kind: true, description: true, createdAt: true } },
            costs: { select: { description: true, createdAt: true } },
            payables: { select: { description: true, createdAt: true } },
          },
        },
        customer: true,
      },
    }),
    // Nomes "da casa" (loja + sócios): dizem se o documento está no nome da
    // loja, do comprador ou ainda do dono anterior.
    houseNameKeys(),
  ]);
  // PreSale não tem relação com veículo/cliente — busca em lote pelos ids.
  const preVehicleIds = openPreRaw.map((p) => p.vehicleId);
  const preCustomerIds = openPreRaw.map((p) => p.customerId);
  const [preVehicles, preCustomers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { id: { in: preVehicleIds } },
      select: { id: true, brand: true, model: true, plate: true },
    }),
    prisma.customer.findMany({
      where: { id: { in: preCustomerIds } },
      select: { id: true, name: true },
    }),
  ]);
  const vehById = new Map(preVehicles.map((v) => [v.id, v]));
  const custById = new Map(preCustomers.map((c) => [c.id, c]));
  const openPre = openPreRaw
    .map((p) => ({
      ...p,
      vehicle: vehById.get(p.vehicleId),
      customer: custById.get(p.customerId),
    }))
    .filter(
      (p) =>
        matchesSearch(
          q,
          p.vehicle?.brand,
          p.vehicle?.model,
          p.vehicle?.plate,
          p.customer?.name,
          formatDate(p.saleDate),
          p.financingAmount,
          formatCurrency(p.financingAmount),
        ) &&
        inDateRange(p.saleDate, de, ate) &&
        inValueRange(p.financingAmount, min, max),
    );

  const ops = opsRaw
    .filter(
      (o) =>
        matchesSearch(
          q,
          o.vehicle.brand,
          o.vehicle.model,
          o.vehicle.plate,
          o.customer.name,
          formatDate(o.saleDate),
          o.financingAmount,
          formatCurrency(o.financingAmount),
        ) &&
        inDateRange(o.saleDate, de, ate) &&
        inValueRange(o.financingAmount, min, max),
    )
    .map((o) => ({
      ...o,
      doc: situacaoDocumental(
        {
          ...o.vehicle,
          sale: {
            saleDate: o.saleDate,
            transferDoneAt: o.transferDoneAt,
            transferCharged: o.transferCharged,
            transferAmount: o.transferAmount,
            ownerName: o.ownerName,
            ownerDocument: o.ownerDocument,
            customer: o.customer,
          },
        },
        houseKeys,
      ),
    }));

  return (
    <div>
      <PageHeader
        title="Financiamento de terceiros"
        description="Operações em que a loja apenas intermediou o financiamento (o veículo é de terceiro)"
        action={
          <Can module="vendas" action="terceiros">
            <LinkButton href="/vendas/financiamento-terceiros/novo">+ Nova operação</LinkButton>
          </Can>
        }
      />

      <ReportToolbar
        basePath="/vendas/financiamento-terceiros"
        printTitle="Financiamento de terceiros"
        q={q}
        placeholder="Buscar (veículo, cliente, valor, data...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
      />

      {openPre.length > 0 ? (
        <Card className="mb-4">
          <CardHeader title="Pré-vendas em aberto" description="Fichas geradas, aguardando conclusão" />
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th>Cliente</Th>
                <Th>Data</Th>
                <Th className="text-right">Financiamento</Th>
                <Th className="text-right">Devolução</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {openPre.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">
                    {p.vehicle ? (
                      <>
                        {p.vehicle.brand} {p.vehicle.model}
                        <span className="ml-1.5 text-xs text-slate-400">{identificacaoVeiculo(p.vehicle)}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">Veículo removido</span>
                    )}
                    {p.refinancing ? (
                      <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-700">Refi</span>
                    ) : null}
                  </Td>
                  <Td>{p.customer?.name ?? "—"}</Td>
                  <Td>{formatDate(p.saleDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(p.financingAmount)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(p.refundAmount)}</Td>
                  <Td className="text-right">
                    <Link
                      href={`/vendas/financiamento-terceiros/pre/${p.id}`}
                      className="whitespace-nowrap text-sm font-medium text-amber-700 hover:underline"
                    >
                      Abrir ficha
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Operações concluídas" />
        {ops.length === 0 ? (
          <EmptyState
            title="Nenhuma operação concluída"
            description="Clique em “Nova operação”, gere a pré-venda e conclua para registrar."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th>Cliente</Th>
                <Th>Data</Th>
                <Th className="text-right">Financiamento</Th>
                <Th className="text-right">Devolução</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <tbody>
              {ops.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-medium text-slate-900">
                    <Link href={`/vendas/financiamento-terceiros/${o.id}`} className="hover:underline">
                      {o.vehicle.brand} {o.vehicle.model}
                    </Link>
                    <span className="ml-1.5 text-xs text-slate-400">{identificacaoVeiculo(o.vehicle)}</span>
                    {o.refinancing ? (
                      <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-700">Refi</span>
                    ) : null}
                    {/* Em nome de quem o documento está: a pergunta que sobra
                        depois da operação — o carro já saiu do nome do dono
                        anterior? */}
                    {o.vehicle.docOwnerName ? (
                      <p className="mt-0.5 text-[11px] font-normal text-slate-500">
                        Este veículo está em nome de{" "}
                        <strong className={o.doc.docOwnerOk ? "text-emerald-600" : "text-rose-600"}>
                          {o.vehicle.docOwnerName}
                        </strong>
                      </p>
                    ) : null}
                    {o.vehicle.transferToName && !o.doc.transferDoneAt ? (
                      <p className="mt-0.5 text-[11px] font-normal text-sky-700">
                        🔄 Transferência para <strong>{o.vehicle.transferToName}</strong>
                      </p>
                    ) : null}
                    {/* No celular a tabela rola de lado e a coluna Situação
                        fica fora da tela — aqui os selos andam junto do
                        veículo, sem precisar arrastar nada. Operação cancelada
                        não tem documentação a cobrar. */}
                    {o.status === "CANCELADA" ? null : (
                      <SelosDaOperacao
                        doc={o.doc}
                        refinancing={o.refinancing}
                        temTransferencia={o.transferCharged && o.transferAmount > 0}
                        className="mt-1.5 font-normal sm:hidden"
                      />
                    )}
                  </Td>
                  <Td>{o.customer.name}</Td>
                  <Td>{formatDate(o.saleDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(o.financingAmount)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(o.refundAmount)}</Td>
                  <Td>
                    {o.status === "CANCELADA" ? (
                      <span className="text-rose-600">Cancelada</span>
                    ) : (
                      <>
                        <span className="text-emerald-700">Concluída</span>
                        <SelosDaOperacao
                          doc={o.doc}
                          refinancing={o.refinancing}
                          temTransferencia={o.transferCharged && o.transferAmount > 0}
                          className="mt-1 hidden sm:flex"
                        />
                      </>
                    )}
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
