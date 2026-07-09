import Link from "next/link";
import { getStockAging } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

function agingTone(days: number): "success" | "info" | "warning" | "danger" {
  if (days <= 30) return "success";
  if (days <= 60) return "info";
  if (days <= 90) return "warning";
  return "danger";
}

export default async function AgingPage() {
  const { buckets, vehicles } = await getStockAging();
  const sorted = [...vehicles].sort((a, b) => b.daysInStock - a.daysInStock);

  return (
    <div>
      <PageHeader
        title="Tempo de estoque (aging)"
        description="Veículo parado é capital parado: acompanhe há quanto tempo cada um está na loja"
        action={<PrintButton />}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((b) => (
          <StatCard
            key={b.label}
            label={b.label}
            value={`${b.count} veículo(s)`}
            hint={b.count > 0 ? `${formatCurrency(b.invested)} investidos` : undefined}
            tone={b.minDays >= 91 && b.count > 0 ? "negative" : b.minDays >= 61 && b.count > 0 ? "warning" : "default"}
          />
        ))}
      </div>

      <Card>
        <CardHeader
          title="Veículos em estoque"
          description="Ordenado do mais antigo para o mais recente · investido = compra + custos lançados"
        />
        {sorted.length === 0 ? (
          <EmptyState
            title="Nenhum veículo em estoque"
            description="Cadastre veículos para acompanhar o tempo de prateleira aqui."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Veículo</Th>
                <Th>Entrada</Th>
                <Th className="text-right">Dias parado</Th>
                <Th className="text-right">Investido</Th>
                <Th className="text-right">Preço anunciado</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <tbody>
              {sorted.map((v) => (
                <Tr key={v.id}>
                  <Td className="font-medium text-slate-900">
                    <Link href={`/estoque/${v.id}`} className="hover:underline">
                      {v.vehicleLabel}
                    </Link>
                    <span className="ml-1.5 text-xs text-slate-400">{v.plate}</span>
                  </Td>
                  <Td>{formatDate(v.entryDate)}</Td>
                  <Td className="text-right">
                    <Badge tone={agingTone(v.daysInStock)}>{v.daysInStock} dias</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatCurrency(v.invested)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(v.salePrice)}</Td>
                  <Td>
                    <Badge tone={v.status === "RESERVADO" ? "warning" : "info"}>
                      {v.status === "RESERVADO" ? "Reservado" : "Em estoque"}
                    </Badge>
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
