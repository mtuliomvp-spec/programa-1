import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteVehicleButton from "./DeleteVehicleButton";
import VehicleStatusActions from "./VehicleStatusActions";
import VehicleCosts from "./VehicleCosts";
import { effectivePayableStatus } from "@/lib/status";
import { daysBetween } from "@/lib/reports";

export const dynamic = "force-dynamic";

const statusTone = { ESTOQUE: "info", RESERVADO: "warning", VENDIDO: "success" } as const;
const statusLabel = { ESTOQUE: "Em estoque", RESERVADO: "Reservado", VENDIDO: "Vendido" } as const;

const payableStatusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const payableStatusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default async function VeiculoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      supplier: true,
      payables: { orderBy: { dueDate: "asc" } },
      costs: { include: { payable: { select: { status: true, dueDate: true } } }, orderBy: { date: "asc" } },
      sale: { include: { customer: true, receivables: true } },
    },
  });

  if (!vehicle) notFound();

  const extraCosts = vehicle.costs.reduce((sum, c) => sum + c.amount, 0);
  const totalCost = vehicle.purchasePrice + extraCosts;
  const sold = vehicle.status === "VENDIDO" && vehicle.sale?.status === "CONCLUIDA";
  const margin = sold && vehicle.sale
    ? vehicle.sale.totalAmount - totalCost
    : vehicle.salePrice - totalCost;
  const daysInStock = daysBetween(
    vehicle.entryDate,
    sold && vehicle.sale ? vehicle.sale.saleDate : new Date(),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${vehicle.brand} ${vehicle.model}`}
        description={`Placa ${vehicle.plate} · ${vehicle.manufactureYear}/${vehicle.modelYear}`}
        action={
          <div className="flex gap-2">
            {vehicle.status !== "VENDIDO" ? (
              <LinkButton href={`/vendas/novo?vehicleId=${vehicle.id}`} variant="primary">
                Vender veículo
              </LinkButton>
            ) : null}
            {vehicle.status !== "VENDIDO" ? (
              <LinkButton href={`/estoque/${vehicle.id}/editar`} variant="secondary">
                Editar
              </LinkButton>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Dados do veículo"
              action={<Badge tone={statusTone[vehicle.status]}>{statusLabel[vehicle.status]}</Badge>}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <InfoItem label="Versão" value={vehicle.version || "-"} />
              <InfoItem label="Cor" value={vehicle.color || "-"} />
              <InfoItem label="KM" value={`${vehicle.km.toLocaleString("pt-BR")} km`} />
              <InfoItem label="Combustível" value={vehicle.fuel || "-"} />
              <InfoItem label="Câmbio" value={vehicle.transmission || "-"} />
              <InfoItem label="Chassi" value={vehicle.chassi || "-"} />
              <InfoItem label="Data de entrada" value={formatDate(vehicle.entryDate)} />
              <InfoItem label="Fornecedor" value={vehicle.supplier?.name || "-"} />
              <InfoItem
                label={sold ? "Dias até vender" : "Dias em estoque"}
                value={`${daysInStock} dia(s)`}
                valueClassName={!sold && daysInStock > 90 ? "text-rose-600" : !sold && daysInStock > 60 ? "text-amber-600" : undefined}
              />
              {vehicle.notes ? <InfoItem label="Observações" value={vehicle.notes} className="col-span-full" /> : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Resultado financeiro"
              description={sold ? "Lucro real desta venda" : "Projeção com base no preço anunciado"}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <InfoItem label="Preço de compra" value={formatCurrency(vehicle.purchasePrice)} />
              <InfoItem label="Custos adicionais" value={formatCurrency(extraCosts)} />
              <InfoItem label="Custo total" value={formatCurrency(totalCost)} />
              <InfoItem
                label={sold ? "Valor de venda" : "Preço anunciado"}
                value={formatCurrency(sold && vehicle.sale ? vehicle.sale.totalAmount : vehicle.salePrice)}
              />
              <InfoItem
                label={sold ? "Lucro real" : "Margem projetada"}
                value={formatCurrency(margin)}
                valueClassName={margin >= 0 ? "text-emerald-600" : "text-rose-600"}
              />
              <InfoItem
                label="Margem %"
                value={`${(
                  (margin / ((sold && vehicle.sale ? vehicle.sale.totalAmount : vehicle.salePrice) || 1)) * 100
                ).toFixed(1)}%`}
                valueClassName={margin >= 0 ? "text-emerald-600" : "text-rose-600"}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Custos do veículo"
              description="Preparação, documentação, mecânica... cada lançamento gera conta a pagar integrada"
            />
            <VehicleCosts
              vehicleId={vehicle.id}
              sold={vehicle.status === "VENDIDO"}
              costs={vehicle.costs.map((c) => ({
                id: c.id,
                description: c.description,
                category: c.category,
                amount: c.amount,
                date: c.date,
                payableStatus: c.payable
                  ? effectivePayableStatus(c.payable.status, c.payable.dueDate)
                  : null,
              }))}
            />
          </Card>

          <Card>
            <CardHeader title="Contas a pagar vinculadas" description="Compra do veículo e custos lançados" />
            {vehicle.payables.length === 0 ? (
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
                  {vehicle.payables.map((p) => (
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

          {vehicle.sale ? (
            <Card>
              <CardHeader title="Venda registrada" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
                <InfoItem label="Cliente" value={vehicle.sale.customer.name} />
                <InfoItem label="Data da venda" value={formatDate(vehicle.sale.saleDate)} />
                <InfoItem label="Valor total" value={formatCurrency(vehicle.sale.totalAmount)} />
                <InfoItem label="Vendedor" value={vehicle.sale.sellerName || "-"} />
              </div>
              <div className="px-5 pb-5">
                <Link href={`/vendas/${vehicle.sale.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                  Ver detalhes da venda →
                </Link>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {vehicle.status !== "VENDIDO" ? (
            <Card>
              <CardHeader title="Situação no estoque" />
              <div className="p-5">
                <VehicleStatusActions id={vehicle.id} status={vehicle.status} />
              </div>
            </Card>
          ) : null}

          {vehicle.status !== "VENDIDO" ? (
            <Card>
              <CardHeader title="Zona de risco" />
              <div className="p-5">
                <DeleteVehicleButton id={vehicle.id} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-slate-800 ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}
