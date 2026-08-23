import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAiUsageSummary, type AiUsageTotals } from "@/lib/ai-usage";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("pt-BR");

/** Custo em dólares com casas suficientes para valores pequenos não sumirem. */
function usd(v: number): string {
  if (v === 0) return "US$ 0,00";
  if (v < 0.01) return `US$ ${v.toFixed(4).replace(".", ",")}`;
  return `US$ ${v.toFixed(2).replace(".", ",")}`;
}

function mesLabel(chave: string): string {
  const [ano, mes] = chave.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1] ?? mes}/${ano}`;
}

/**
 * Colunas de total. As falhas entram como nota na própria coluna de chamadas —
 * uma coluna só para elas espremia o custo para fora do card.
 */
function Totais({ t }: { t: AiUsageTotals }) {
  return (
    <>
      <Td>
        {nf.format(t.chamadas)}
        {t.erros > 0 ? (
          <span className="ml-1 text-xs text-rose-600">({nf.format(t.erros)} falhou)</span>
        ) : null}
      </Td>
      <Td>{nf.format(t.tokens)}</Td>
      <Td>{usd(t.custoUsd)}</Td>
    </>
  );
}

export default async function UsoIaPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/");

  const resumo = await getAiUsageSummary();
  const vazio = resumo.total.chamadas === 0;

  return (
    <div>
      <PageHeader
        title="Uso de IA"
        description="Quanto esta instalação consumiu nas leituras automáticas de documento e no Parecer"
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Chamadas no mês" value={nf.format(resumo.mes.chamadas)} hint="leituras e pareceres" />
        <StatCard label="Custo no mês" value={usd(resumo.mes.custoUsd)} hint="estimativa pela tabela do provedor" />
        <StatCard label="Tokens no mês" value={nf.format(resumo.mes.tokens)} hint="entrada + saída" />
        <StatCard
          label="Custo acumulado"
          value={usd(resumo.total.custoUsd)}
          hint={resumo.desde ? `desde ${formatDate(resumo.desde)}` : "sem uso registrado"}
        />
      </div>

      {vazio ? (
        <Card>
          <EmptyState
            title="Nenhuma chamada de IA ainda"
            description="Assim que alguém importar um contrato, uma NF-e, comprovantes ou gerar o Parecer, o consumo aparece aqui."
          />
        </Card>
      ) : (
        // Cards empilhados: a tabela do sistema tem largura mínima de 640px e a
        // coluna de custo ficaria cortada dentro de um card de meia tela.
        <div className="space-y-4">
          <Card>
            <CardHeader title="Por funcionalidade" />
            <Table>
              <Thead>
                <Tr>
                  <Th>Recurso</Th>
                  <Th>Chamadas</Th>
                  <Th>Tokens</Th>
                  <Th>Custo</Th>
                </Tr>
              </Thead>
              <tbody>
                {resumo.porFuncionalidade.map((f) => (
                  <Tr key={f.feature}>
                    <Td>{f.label}</Td>
                    <Totais t={f} />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Mês a mês" />
            <Table>
              <Thead>
                <Tr>
                  <Th>Mês</Th>
                  <Th>Chamadas</Th>
                  <Th>Tokens</Th>
                  <Th>Custo</Th>
                </Tr>
              </Thead>
              <tbody>
                {resumo.porMes.map((m) => (
                  <Tr key={m.mes}>
                    <Td>{mesLabel(m.mes)}</Td>
                    <Totais t={m} />
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Últimas chamadas" />
            <Table>
              <Thead>
                <Tr>
                  <Th>Quando</Th>
                  <Th>Recurso</Th>
                  <Th>Usuário</Th>
                  <Th>Modelo</Th>
                  <Th>Entrada</Th>
                  <Th>Saída</Th>
                  <Th>Custo</Th>
                  <Th>Situação</Th>
                </Tr>
              </Thead>
              <tbody>
                {resumo.ultimas.map((u) => (
                  <Tr key={u.id}>
                    <Td>{formatDate(u.createdAt)}</Td>
                    <Td>{u.label}</Td>
                    <Td>{u.userName || "—"}</Td>
                    <Td className="text-xs text-slate-500">{u.model}</Td>
                    <Td>{nf.format(u.inputTokens)}</Td>
                    <Td>{nf.format(u.outputTokens)}</Td>
                    <Td>{usd(u.custoUsd)}</Td>
                    <Td>
                      {u.ok ? (
                        <Badge tone="success">OK</Badge>
                      ) : (
                        <span title={u.errorMessage || undefined}>
                          <Badge tone="danger">Falhou</Badge>
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        O custo é uma <strong>estimativa</strong> calculada pela tabela pública de preços do provedor sobre os tokens
        de cada chamada — a cobrança real é a da fatura do provedor da chave configurada. Só a metragem é guardada:
        nada do conteúdo enviado à IA fica registrado aqui.
      </p>
    </div>
  );
}
