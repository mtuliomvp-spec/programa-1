import Link from "next/link";
import { timed } from "@/lib/perf";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;
const statusTone = { CONCLUIDA: "success", CANCELADA: "danger" } as const;
const statusLabel = { CONCLUIDA: "Concluída", CANCELADA: "Cancelada" } as const;

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const { q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const canPreSale = await userCan("vendas", "prevenda");
  const [allSales, allPreSales] = await timed("tela: vendas", () =>
    Promise.all([
      prisma.sale.findMany({
        where: { saleType: "VENDA" },
        orderBy: { saleDate: "desc" },
        include: { vehicle: true, customer: true },
      }),
      prisma.preSale.findMany({
        where: { status: "ABERTA", saleType: "VENDA" },
        orderBy: { createdAt: "desc" },
      }),
    ]),
  );

  // Dados dos veículos/clientes das pré-vendas abertas (para exibir na lista).
  const preVehicleIds = [...new Set(allPreSales.map((p) => p.vehicleId))];
  const preCustomerIds = [...new Set(allPreSales.map((p) => p.customerId))];
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

  // Busca livre + intervalo de data da venda + faixa de valor (vendas e pré-vendas).
  const sales = allSales.filter(
    (s) =>
      matchesSearch(
        q,
        s.vehicle.brand,
        s.vehicle.model,
        s.vehicle.plate,
        s.customer.name,
        formatDate(s.saleDate),
        s.totalAmount,
        formatCurrency(s.totalAmount),
        paymentLabel[s.paymentMethod],
        statusLabel[s.status],
        s.sellerName,
      ) &&
      inDateRange(s.saleDate, de, ate) &&
      inValueRange(s.totalAmount, min, max),
  );
  const preSales = allPreSales.filter((p) => {
    const v = vehicleById.get(p.vehicleId);
    return (
      matchesSearch(
        q,
        String(p.number).padStart(4, "0"),
        v ? `${v.brand} ${v.model} ${v.plate}` : null,
        customerById.get(p.customerId)?.name,
        formatDate(p.saleDate),
        p.totalAmount,
        formatCurrency(p.totalAmount),
      ) &&
      inDateRange(p.saleDate, de, ate) &&
      inValueRange(p.totalAmount, min, max)
    );
  });

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

      <ReportToolbar
        basePath="/vendas"
        printTitle="Vendas de veículos"
        q={q}
        placeholder="Buscar (veículo, cliente, valor, data...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
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
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhuma venda registrada"}
            action={canPreSale && !q ? <LinkButton href="/vendas/novo">+ Nova venda</LinkButton> : undefined}
          />
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
