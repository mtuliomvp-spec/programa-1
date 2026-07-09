import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;
const statusTone = { CONCLUIDA: "success", CANCELADA: "danger" } as const;
const statusLabel = { CONCLUIDA: "Concluída", CANCELADA: "Cancelada" } as const;

export default async function VendasPage() {
  const sales = await prisma.sale.findMany({
    orderBy: { saleDate: "desc" },
    include: { vehicle: true, customer: true },
  });

  const totalConcluidas = sales
    .filter((s) => s.status === "CONCLUIDA")
    .reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div>
      <PageHeader
        title="Vendas de veículos"
        description={`${sales.length} venda(s) · total: ${formatCurrency(totalConcluidas)}`}
        action={<LinkButton href="/vendas/novo">+ Nova venda</LinkButton>}
      />
      <Card>
        {sales.length === 0 ? (
          <EmptyState title="Nenhuma venda registrada" action={<LinkButton href="/vendas/novo">+ Nova venda</LinkButton>} />
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
