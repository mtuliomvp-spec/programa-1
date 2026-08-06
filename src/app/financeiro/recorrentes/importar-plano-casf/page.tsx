import { requireAction } from "@/lib/guards";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { CASF_BOLETO_AGOSTO, CASF_SUPPLIER } from "./data";
import ImportButton from "./ImportButton";

export const dynamic = "force-dynamic";

export default async function ImportarPlanoCasfPage() {
  await requireAction("financeiro", "criar");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Plano de saúde CASF"
        description="Recorrência mensal (dia 05) debitada do capital do Marco Antonio + boleto de 05/08/2026"
        action={
          <LinkButton href="/financeiro/recorrentes" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="O que será cadastrado"
          description={`Recorrência "Plano de saúde CASF" — vencimento todo dia 05, fluxo Capital (a baixa vira retirada do capital do Marco Antonio), fornecedor ${CASF_SUPPLIER}. A competência é o mês anterior ao vencimento e sai na descrição do título. O boleto de 05/08/2026 (competência 07/2026) é lançado junto. Ação idempotente (não duplica).`}
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Pessoa no plano</Th>
              <Th className="text-right">Mensalidade</Th>
              <Th className="text-right">Coparticipação</Th>
            </Tr>
          </Thead>
          <tbody>
            {CASF_BOLETO_AGOSTO.pessoas.map((p) => (
              <Tr key={p.nome}>
                <Td className="font-medium text-slate-900">{p.nome}</Td>
                <Td className="text-right tabular-nums">{formatCurrency(p.mensalidade)}</Td>
                <Td className="text-right tabular-nums">
                  {p.coparticipacao > 0 ? formatCurrency(p.coparticipacao) : "—"}
                </Td>
              </Tr>
            ))}
            <Tr className="bg-slate-50 font-semibold">
              <Td>Boleto de 05/08/2026 (competência 07/2026)</Td>
              <Td className="text-right tabular-nums">{formatCurrency(CASF_BOLETO_AGOSTO.mensalidade)}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(CASF_BOLETO_AGOSTO.coparticipacao)}</Td>
            </Tr>
            <Tr className="bg-slate-50 font-bold">
              <Td>Total</Td>
              <Td className="text-right">{""}</Td>
              <Td className="text-right tabular-nums">{formatCurrency(CASF_BOLETO_AGOSTO.total)}</Td>
            </Tr>
          </tbody>
        </Table>
        <p className="px-5 py-3 text-xs text-slate-500">
          ⚠️ O valor muda todo mês (a coparticipação depende do uso do plano). Nos próximos meses o
          título nasce sozinho com o valor-base — abra o título, ajuste o valor conforme o boleto e
          só então pague.
        </p>
      </Card>

      <Card>
        <div className="p-5">
          <ImportButton />
        </div>
      </Card>
    </div>
  );
}
