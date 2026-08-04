import { requireAction } from "@/lib/guards";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { IMPOSTOS_ROWS } from "./data";
import ImportButton from "./ImportButton";

export const dynamic = "force-dynamic";

export default async function ImportarImpostosPage() {
  await requireAction("financeiro", "criar");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Impostos mensais — DAS · FGTS · DARF INSS"
        description="3 recorrências (dia 20, antecipa para o último dia útil) + guias de 20/07/2026"
        action={
          <LinkButton href="/financeiro/recorrentes" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="O que será cadastrado"
          description="Vencimento todo dia 20 (se cair em fim de semana ou feriado, antecipa para o último dia útil). A competência de cada guia é o mês anterior ao vencimento e sai na descrição do título. A primeira ocorrência (20/07/2026, competência 06/2026) é lançada junto. Ação idempotente (não duplica)."
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Guia</Th>
              <Th>Fornecedor</Th>
              <Th className="text-right">Valor-base</Th>
              <Th>Observação</Th>
            </Tr>
          </Thead>
          <tbody>
            {IMPOSTOS_ROWS.map((r) => (
              <Tr key={r.key}>
                <Td className="font-medium text-slate-900">{r.description.replace(" {competencia}", "")}</Td>
                <Td className="text-slate-600">{r.supplier}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(r.amount)}</Td>
                <Td className="max-w-xs text-xs text-slate-500">{r.notes}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <div className="p-5">
          <ImportButton />
        </div>
      </Card>
    </div>
  );
}
