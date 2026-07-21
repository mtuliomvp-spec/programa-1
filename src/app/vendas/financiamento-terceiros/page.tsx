import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/guards";
import { formatCurrency, formatDate } from "@/lib/format";
import {
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

export const dynamic = "force-dynamic";

export default async function FinanciamentoTerceirosListPage() {
  await requireModule("vendas");

  const ops = await prisma.sale.findMany({
    where: { saleType: "FINANCIAMENTO_TERCEIROS" },
    orderBy: { saleDate: "desc" },
    include: { vehicle: true, customer: true },
  });

  return (
    <div>
      <PageHeader
        title="Financiamento de terceiros"
        description="Operações em que a loja apenas intermediou o financiamento (o veículo é de terceiro)"
        action={
          <LinkButton href="/vendas/financiamento-terceiros/novo">+ Nova operação</LinkButton>
        }
      />
      <Card>
        <CardHeader title="Operações" />
        {ops.length === 0 ? (
          <EmptyState
            title="Nenhuma operação registrada"
            description="Clique em “Nova operação” para registrar um financiamento de terceiros."
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
                    <span className="ml-1.5 text-xs text-slate-400">{o.vehicle.plate}</span>
                  </Td>
                  <Td>{o.customer.name}</Td>
                  <Td>{formatDate(o.saleDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(o.financingAmount)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(o.refundAmount)}</Td>
                  <Td>
                    {o.status === "CANCELADA" ? (
                      <span className="text-rose-600">Cancelada</span>
                    ) : (
                      <span className="text-emerald-700">Concluída</span>
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
