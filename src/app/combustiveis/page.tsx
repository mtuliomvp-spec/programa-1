import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import FuelForm from "./FuelForm";
import DeleteFuelButton from "./DeleteFuelButton";

export const dynamic = "force-dynamic";

export default async function CombustiveisPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  const { q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [allEntries, vehicles] = await Promise.all([
    prisma.fuelEntry.findMany({ orderBy: { date: "desc" }, take: 100 }),
    prisma.vehicle.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, brand: true, model: true, plate: true },
    }),
  ]);

  const entries = allEntries.filter(
    (e) =>
      matchesSearch(
        q,
        formatDate(e.date),
        e.plate,
        e.driver,
        e.station,
        e.total,
        formatCurrency(e.total),
      ) &&
      inDateRange(e.date, de, ate) &&
      inValueRange(e.total, min, max),
  );
  const monthEntries = entries.filter((e) => e.date >= monthStart);
  const monthTotal = monthEntries.reduce((s, e) => s + e.total, 0);
  const monthLiters = monthEntries.reduce((s, e) => s + e.liters, 0);

  const byPlate = new Map<string, { total: number; liters: number }>();
  for (const e of monthEntries) {
    const key = e.plate || "—";
    const acc = byPlate.get(key) ?? { total: 0, liters: 0 };
    acc.total += e.total;
    acc.liters += e.liters;
    byPlate.set(key, acc);
  }
  const topPlates = [...byPlate.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 4);

  return (
    <div>
      <PageHeader
        title="Controle de combustíveis"
        description="Abastecimentos da frota, integrados às contas a pagar"
      />

      <ReportToolbar
        basePath="/combustiveis"
        printTitle="Controle de combustíveis"
        q={q}
        placeholder="Buscar (placa, motorista, posto, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gasto no mês" value={formatCurrency(monthTotal)} />
        <StatCard label="Litros no mês" value={`${monthLiters.toLocaleString("pt-BR")} L`} />
        <StatCard
          label="Maior consumo (mês)"
          value={topPlates[0] ? topPlates[0][0] : "—"}
          hint={topPlates[0] ? formatCurrency(topPlates[0][1].total) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Abastecimentos" description="Últimos 100 lançamentos" />
          {entries.length === 0 ? (
            <EmptyState
              title="Nenhum abastecimento registrado"
              description="Registre o primeiro abastecimento ao lado."
            />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Data</Th>
                  <Th>Placa</Th>
                  <Th>Motorista</Th>
                  <Th>Posto</Th>
                  <Th className="text-right">Litros</Th>
                  <Th className="text-right">R$/L</Th>
                  <Th className="text-right">Total</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {entries.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap">{formatDate(e.date)}</Td>
                    <Td className="font-medium text-slate-900">{e.plate || "—"}</Td>
                    <Td>{e.driver || "—"}</Td>
                    <Td>{e.station || "—"}</Td>
                    <Td className="text-right tabular-nums">{e.liters.toLocaleString("pt-BR")}</Td>
                    <Td className="text-right tabular-nums">{e.pricePerLiter.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatCurrency(e.total)}</Td>
                    <Td>
                      <DeleteFuelButton id={e.id} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="h-fit print:hidden">
          <CardHeader title="Novo abastecimento" />
          <div className="p-5">
            <FuelForm vehicles={vehicles} />
          </div>
        </Card>
      </div>
    </div>
  );
}
