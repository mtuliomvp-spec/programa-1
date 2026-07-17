import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;
const statusTone = { CONCLUIDA: "success", CANCELADA: "danger" } as const;
const statusLabel = { CONCLUIDA: "Concluída", CANCELADA: "Cancelada" } as const;

export default async function VendasPage() {
  const canPreSale = await userCan("vendas", "prevenda");
  const [sales, preSales] = await Promise.all([
    prisma.sale.findMany({
      orderBy: { saleDate: "desc" },
      include: { vehicle: true, customer: true },
    }),
    prisma.preSale.findMany({ where: { status: "ABERTA" }, orderBy: { createdAt: "desc" } }),
  ]);

  // Dados dos veículos/clientes das pré-vendas abertas (para exibir na lista).
  const preVehicleIds = [...new Set(preSales.map((p) => p.vehicleId))];
  const preCustomerIds = [...new Set(preSales.map((p) => p.customerId))];
  const [preVehicles, preCustomers] = await Promise.all([
    preVehicleIds.length
      ? prisma.vehicle.findMany({ where: { id: { in: preVehicleIds } }, select: { id: true, brand: true, model: true, plate: true } })
      : Promise.resolve([]),
    preCustomerIds.length
      ? prisma.customer.findMany({ where: { id: { in: preCustomerIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const vehicleById = new Map(preVehicles.map((v) => [v.id, v]));
  const customerById = new Map(preCustomers.map((c) => [c.id, c]));

  const totalConcluidas = sales
    .filter((s) => s.status === "CONCLUIDA")
    .reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div>
      <PageHeader
        title="Vendas de veículos"
        description={`${sales.length} venda(s) · total: ${formatCurrency(totalConcluidas)}`}
        action={canPreSale ? <LinkButton href="/vendas/novo">+ Nova venda</LinkButton> : undefined}
      />

      {preSales.length > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title="Pré-vendas em aberto"
            description="Fichas de negócio ainda não registradas — revise, imprima ou registre a venda"
          />
          <Table>
            <Thead>
              <Tr>
                <Th>Nº</Th>
                <Th>Veículo</Th>
                <Th>Cliente</Th>
                <Th>Data</Th>
                <Th>Valor</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {preSales.map((p) => {
                const v = vehicleById.get(p.vehicleId);
                return (
                  <Tr key={p.id}>
                    <Td>{String(p.number).padStart(4, "0")}</Td>
                    <Td className="font-medium text-slate-900">
                      {v ? `${v.brand} ${v.model} - ${v.plate}` : "—"}
                    </Td>
                    <Td>{customerById.get(p.customerId)?.name ?? "—"}</Td>
                    <Td>{formatDate(p.saleDate)}</Td>
                    <Td>{formatCurrency(p.totalAmount)}</Td>
                    <Td>
                      <Link href={`/vendas/pre-vendas/${p.id}`} className="text-sm font-medium text-amber-700 hover:underline">
                        Abrir ficha
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}
      <Card>
        {sales.length === 0 ? (
          <EmptyState title="Nenhuma venda registrada" action={canPreSale ? <LinkButton href="/vendas/novo">+ Nova venda</LinkButton> : undefined} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th>Cliente</Th>
                <Th>Data</Th>
                <Th>Valor</Th>
                <Th>Pagamento</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {sales.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium text-slate-900">
                    {s.vehicle.brand} {s.vehicle.model} - {s.vehicle.plate}
                  </Td>
                  <Td>{s.customer.name}</Td>
                  <Td>{formatDate(s.saleDate)}</Td>
                  <Td>{formatCurrency(s.totalAmount)}</Td>
                  <Td>{paymentLabel[s.paymentMethod]}</Td>
                  <Td>
                    <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/vendas/${s.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                      Ver detalhes
                    </Link>
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
