import { requireAction } from "@/lib/guards";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { FATURA_ROWS, rowDescription, rowBeneficiary, BENEFICIARIES, CARTAO_TOTAL } from "./data";
import ImportButton from "./ImportButton";

export const dynamic = "force-dynamic";

export default async function ImportarCartaoSantanderPage() {
  await requireAction("financeiro", "criar");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="💳 Cartão Santander Unique Visa (final 7574)"
        description={`Recorrência mensal (dia 4, débito automático) + fatura de 04/08/2026: ${FATURA_ROWS.length} lançamentos · ${formatCurrency(CARTAO_TOTAL)}`}
        action={
          <LinkButton href="/financeiro/recorrentes" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="Lançamentos da fatura (como no extrato)"
          description="Compras internacionais já somadas com o IOF da própria linha. Cada lançamento entra no fluxo Capital do sócio indicado — depois dá para editar um a um dentro do título. Ação idempotente (não duplica)."
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Lançamento</Th>
              <Th>Capital de</Th>
              <Th className="text-right">Valor</Th>
            </Tr>
          </Thead>
          <tbody>
            {FATURA_ROWS.map((r, i) => (
              <Tr key={i}>
                <Td className="text-slate-800">{rowDescription(r)}</Td>
                <Td className="text-slate-600">{BENEFICIARIES[rowBeneficiary(r)].createName}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(r.amount)}</Td>
              </Tr>
            ))}
            <Tr>
              <Td className="font-bold text-slate-900">Total da fatura</Td>
              <Td>{""}</Td>
              <Td className="text-right font-black tabular-nums text-slate-900">
                {formatCurrency(CARTAO_TOTAL)}
              </Td>
            </Tr>
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
