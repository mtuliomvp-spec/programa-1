import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
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
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";

export const dynamic = "force-dynamic";

export default async function FinanciamentoTerceirosListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  await requireModule("vendas");
  const { q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();

  const [openPreRaw, opsRaw] = await Promise.all([
    prisma.preSale.findMany({
      where: { saleType: "FINANCIAMENTO_TERCEIROS", status: "ABERTA" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sale.findMany({
      where: { saleType: "FINANCIAMENTO_TERCEIROS" },
      orderBy: { saleDate: "desc" },
      include: { vehicle: true, customer: true },
    }),
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

  const ops = opsRaw.filter(
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
  );

  return (
    <div>
      <PageHeader
        title="Financiamento de terceiros"
        description="Operações em que a loja apenas intermediou o financiamento (o veículo é de terceiro)"
        action={
          <Can module="vendas" action="prevenda">
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
              </Tr>
            </Thead>
            <tbody>
              {openPre.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-slate-900">
                    <Link href={`/vendas/financiamento-terceiros/pre/${p.id}`} className="hover:underline">
                      {p.vehicle?.brand} {p.vehicle?.model}
                    </Link>
                    <span className="ml-1.5 text-xs text-slate-400">{p.vehicle?.plate}</span>
                  </Td>
                  <Td>{p.customer?.name ?? "—"}</Td>
                  <Td>{formatDate(p.saleDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(p.financingAmount)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(p.refundAmount)}</Td>
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
