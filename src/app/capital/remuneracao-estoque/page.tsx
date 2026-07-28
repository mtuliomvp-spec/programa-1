import { prisma } from "@/lib/prisma";
import { ensureCompanyBeneficiary } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { stockVehiclesForInterest, stockInterestHistory } from "@/lib/stock-interest";
import { userCan } from "@/lib/guards";
import RemuneracaoForm from "./RemuneracaoForm";
import ReverseRunButton from "./ReverseRunButton";

export const dynamic = "force-dynamic";

export default async function RemuneracaoEstoquePage() {
  await ensureCompanyBeneficiary();
  const canManage = await userCan("administrativo", "capital");
  const [vehicles, beneficiaries, history] = await Promise.all([
    stockVehiclesForInterest(),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    stockInterestHistory(),
  ]);

  return (
    <div>
      <PageHeader
        title="Remuneração de capital sobre o estoque"
        description="Aplica um percentual de juros sobre o custo dos veículos em estoque, somando ao custo de cada um e creditando o valor como aporte de capital aos sócios (rateio livre)."
      />

      <Card className="mb-4 border-blue-200 bg-blue-50/60 px-4 py-3 print:hidden">
        <p className="text-sm text-slate-600">
          O juro de cada veículo <strong>entra no custo dele</strong> (reduz a margem quando for
          vendido) e, ao mesmo tempo, é <strong>creditado como aporte de capital</strong> para os
          sócios que você escolher, nos percentuais que quiser (somando 100%). Enquanto o veículo
          está em estoque o lucro não muda — a remuneração só vira resultado na venda. Cada execução
          pode ser <strong>estornada</strong> (enquanto o veículo não for vendido).
        </p>
      </Card>

      {vehicles.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum veículo em estoque"
            description="Cadastre veículos no estoque para aplicar a remuneração de capital."
          />
        </Card>
      ) : canManage ? (
        <RemuneracaoForm vehicles={vehicles} beneficiaries={beneficiaries} />
      ) : null}

      <Card className="mt-6 print:hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Histórico de execuções</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Cada lote pode ser estornado enquanto nenhum veículo do lote tiver sido vendido.
          </p>
        </div>
        {history.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma execução ainda" description="As rotinas executadas aparecerão aqui." />
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Taxa</Th>
                <Th>Descrição</Th>
                <Th className="text-right">Veículos</Th>
                <Th className="text-right">Juros gerados</Th>
                <Th>Situação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {history.map((h) => (
                <Tr key={h.id}>
                  <Td className="whitespace-nowrap">{formatDate(h.date)}</Td>
                  <Td className="tabular-nums">
                    {h.ratePercent.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%
                  </Td>
                  <Td className="text-slate-600">{h.description || "—"}</Td>
                  <Td className="text-right tabular-nums">{h.vehicleCount}</Td>
                  <Td className="text-right tabular-nums font-medium text-slate-900">
                    {formatCurrency(h.totalInterest)}
                  </Td>
                  <Td>
                    {h.canReverse ? (
                      <Badge tone="success">Estornável</Badge>
                    ) : (
                      <Badge tone="default">Consolidado (venda)</Badge>
                    )}
                  </Td>
                  <Td>
                    {h.canReverse && canManage ? (
                      <ReverseRunButton runId={h.id} runDate={h.date.toISOString()} />
                    ) : null}
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
