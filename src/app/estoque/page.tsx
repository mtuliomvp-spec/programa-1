import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { Badge, Card, EmptyState, Input, LinkButton, Select, Table, Td, Th, Thead, Tr, PageHeader } from "@/components/ui";
import type { StatusVeiculo } from "@prisma/client";

export const dynamic = "force-dynamic";

const statusLabel: Record<StatusVeiculo, { label: string; tone: "info" | "warning" | "success" }> = {
  ESTOQUE: { label: "Em estoque", tone: "info" },
  RESERVADO: { label: "Reservado", tone: "warning" },
  VENDIDO: { label: "Vendido", tone: "success" },
};

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = params.status && params.status !== "TODOS" ? (params.status as StatusVeiculo) : undefined;
  const q = params.q?.trim();

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status,
      ...(q
        ? {
            OR: [
              { brand: { contains: q } },
              { model: { contains: q } },
              { plate: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const totalValue = vehicles
    .filter((v) => v.status !== "VENDIDO")
    .reduce((sum, v) => sum + v.salePrice, 0);

  return (
    <div>
      <PageHeader
        title="Estoque de veículos"
        description={`${vehicles.length} veículo(s) listado(s) · valor em estoque: ${formatCurrency(totalValue)}`}
        action={<LinkButton href="/estoque/novo">+ Novo veículo</LinkButton>}
      />

      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input name="q" placeholder="Buscar por marca, modelo ou placa" defaultValue={q} />
          </div>
          <div className="w-48">
            <Select name="status" defaultValue={params.status || "TODOS"}>
              <option value="TODOS">Todos os status</option>
              <option value="ESTOQUE">Em estoque</option>
              <option value="RESERVADO">Reservado</option>
              <option value="VENDIDO">Vendido</option>
            </Select>
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Filtrar
          </button>
        </form>
      </Card>

      <Card>
        {vehicles.length === 0 ? (
          <EmptyState
            title="Nenhum veículo encontrado"
            description="Cadastre o primeiro veículo do estoque para começar."
            action={<LinkButton href="/estoque/novo">+ Novo veículo</LinkButton>}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th>Placa</Th>
                <Th>Ano</Th>
                <Th>KM</Th>
                <Th>Preço de venda</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {vehicles.map((v) => (
                <Tr key={v.id}>
                  <Td className="font-medium text-slate-900">
                    {v.brand} {v.model} {v.version ? <span className="text-slate-400">{v.version}</span> : null}
                  </Td>
                  <Td>{v.plate}</Td>
                  <Td>
                    {v.manufactureYear}/{v.modelYear}
                  </Td>
                  <Td>{v.km.toLocaleString("pt-BR")} km</Td>
                  <Td>{formatCurrency(v.salePrice)}</Td>
                  <Td>
                    <Badge tone={statusLabel[v.status].tone}>{statusLabel[v.status].label}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/estoque/${v.id}`} className="text-sm font-medium text-slate-900 hover:underline">
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
