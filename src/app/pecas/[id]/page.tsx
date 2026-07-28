import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteRowButton from "@/components/DeleteRowButton";
import { userCan } from "@/lib/guards";
import { deletePartAction } from "../actions";
import AddStockForm from "./AddStockForm";
import SellPartForm from "./SellPartForm";

export const dynamic = "force-dynamic";

const payableStatusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const payableStatusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default async function PecaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [part, suppliers, customers] = await Promise.all([
    prisma.part.findUnique({
      where: { id },
      include: {
        supplier: true,
        payables: { orderBy: { createdAt: "desc" } },
        partSales: { orderBy: { saleDate: "desc" }, include: { customer: true } },
      },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!part) notFound();

  const [canEditar, canRepor, canVender, canExcluir] = await Promise.all([
    userCan("pecas", "editar"),
    userCan("pecas", "repor"),
    userCan("pecas", "vender"),
    userCan("pecas", "excluir"),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={part.name}
        description={`Código ${part.code} · ${part.quantity} un. em estoque`}
        action={
          canEditar ? (
            <LinkButton href={`/pecas/${part.id}/editar`} variant="secondary">Editar</LinkButton>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Dados da peça" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <Info label="Quantidade em estoque" value={`${part.quantity} un.`} />
              <Info label="Estoque mínimo" value={`${part.minQuantity} un.`} />
              <Info label="Preço de custo" value={formatCurrency(part.costPrice)} />
              <Info label="Preço de venda" value={formatCurrency(part.salePrice)} />
              <Info label="Fornecedor" value={part.supplier?.name || "-"} />
              {part.description ? <Info label="Descrição" value={part.description} className="col-span-full" /> : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Histórico de vendas" />
            {part.partSales.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhuma venda registrada.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Data</Th>
                    <Th>Cliente</Th>
                    <Th>Qtd.</Th>
                    <Th>Total</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {part.partSales.map((s) => (
                    <Tr key={s.id}>
                      <Td>{formatDate(s.saleDate)}</Td>
                      <Td>{s.customer?.name || "Balcão"}</Td>
                      <Td>{s.quantity}</Td>
                      <Td>{formatCurrency(s.totalAmount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Contas a pagar vinculadas" />
            {part.payables.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhuma conta a pagar vinculada.</p>
            ) : (
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
                  {part.payables.map((p) => (
                    <Tr key={p.id}>
                      <Td>{p.description}</Td>
                      <Td>{formatDate(p.dueDate)}</Td>
                      <Td>{formatCurrency(p.amount)}</Td>
                      <Td>
                        <Badge tone={payableStatusTone[p.status]}>{payableStatusLabel[p.status]}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {canRepor ? (
            <Card>
              <CardHeader title="Repor estoque" description="Gera conta a pagar automaticamente" />
              <div className="p-5">
                <AddStockForm partId={part.id} currentCostPrice={part.costPrice} supplierId={part.supplierId} suppliers={suppliers} />
              </div>
            </Card>
          ) : null}

          {canVender ? (
            <Card>
              <CardHeader title="Vender peça" description="Gera conta a receber automaticamente" />
              <div className="p-5">
                <SellPartForm partId={part.id} currentSalePrice={part.salePrice} availableQuantity={part.quantity} customers={customers} />
              </div>
            </Card>
          ) : null}

          {canExcluir ? (
            <Card>
              <CardHeader title="Zona de risco" />
              <div className="p-5">
                <DeleteRowButton
                  id={part.id}
                  action={deletePartAction}
                  confirmMessage={`Excluir a peça ${part.name}?`}
                />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
