import { getExpensesByCategory } from "@/lib/reports";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const params = await searchParams;
  const months = params.meses === "3" ? 3 : params.meses === "6" ? 6 : 12;
  const { rows, total, from } = await getExpensesByCategory(months);

  return (
    <div>
      <PageHeader
        title="Despesas por categoria"
        description={`Contas a pagar desde ${formatDate(from)} · total ${formatCurrency(total)}`}
        action={
          <div className="flex gap-2 print:hidden">
            {[3, 6, 12].map((m) => (
              <LinkButton
                key={m}
                href={`/relatorios/despesas?meses=${m}`}
                variant={months === m ? "primary" : "secondary"}
              >
                {m} meses
              </LinkButton>
            ))}
            <PrintButton />
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Onde o dinheiro está indo"
          description="Inclui contas pagas e pendentes do período, por categoria"
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nenhuma conta no período"
            description="Lance contas a pagar para acompanhar as despesas da loja."
          />
        ) : (
          <>
            <div className="space-y-3 px-5 py-4">
              {rows.map((r) => {
                const pct = total > 0 ? (r.total / total) * 100 : 0;
                return (
                  <div key={r.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="tabular-nums text-slate-600">
                        {formatCurrency(r.total)}{" "}
                        <span className="text-xs text-slate-400">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(1, pct)}%`, background: "#2a78d6" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Table>
              <Thead>
                <Tr>
                  <Th>Categoria</Th>
                  <Th className="text-right">Lançamentos</Th>
                  <Th className="text-right">Já pago</Th>
                  <Th className="text-right">Pendente</Th>
                  <Th className="text-right">Total</Th>
                </Tr>
              </Thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.label}>
                    <Td className="font-medium text-slate-900">{r.label}</Td>
                    <Td className="text-right tabular-nums">{r.count}</Td>
                    <Td className="text-right tabular-nums text-emerald-600">{formatCurrency(r.paid)}</Td>
                    <Td className="text-right tabular-nums text-amber-600">{formatCurrency(r.pending)}</Td>
                    <Td className="text-right font-semibold tabular-nums">{formatCurrency(r.total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
