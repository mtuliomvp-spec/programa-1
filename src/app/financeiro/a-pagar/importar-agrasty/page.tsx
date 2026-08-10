import { requireAction } from "@/lib/guards";
import { formatCurrency, formatDate, parseDateInput } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { AGRASTY_ROWS, AGRASTY_DUE_DATE } from "./data";
import ImportButton from "./ImportButton";

export const dynamic = "force-dynamic";

export default async function ImportarAgrastyPage() {
  await requireAction("financeiro", "criar");

  const total = AGRASTY_ROWS.reduce((s, r) => s + r.amount, 0);
  const due = formatDate(parseDateInput(AGRASTY_DUE_DATE));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Lançar títulos — Pix 31/07 (saque Agrasty)"
        description={`${AGRASTY_ROWS.length} títulos · total ${formatCurrency(total)} · vencimento ${due} · fluxo Capital, beneficiário Agrasty`}
        action={
          <LinkButton href="/financeiro/a-pagar" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="Títulos a lançar"
          description="Cada título entra em Contas a pagar PENDENTE, com fornecedor = recebedor do Pix e saque no capital da Agrasty (a retirada acontece na baixa). Ação idempotente (não duplica)."
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Fornecedor (recebedor)</Th>
              <Th>Pago via</Th>
              <Th>ID Pix</Th>
              <Th className="text-right">Valor</Th>
            </Tr>
          </Thead>
          <tbody>
            {AGRASTY_ROWS.map((r) => (
              <Tr key={r.doc}>
                <Td className="text-slate-800">{r.supplier}</Td>
                <Td className="text-slate-600">{r.payer}</Td>
                <Td className="tabular-nums text-xs text-slate-400">…{r.doc.slice(-10)}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(r.amount)}</Td>
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
