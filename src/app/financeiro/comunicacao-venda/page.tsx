import { requireAction } from "@/lib/guards";
import { getCompany } from "@/lib/company";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import FaturaConferencia from "./FaturaConferencia";
import ComprovanteAvulso from "./ComprovanteAvulso";

export const dynamic = "force-dynamic";

/**
 * Conferência da fatura mensal da comunicação de venda: o que a prestadora
 * cobrou × o que o sistema registrou. Pega serviço cobrado sem lançamento,
 * lançamento com valor diferente e título que a fatura não cobrou.
 */
export default async function ConferenciaFaturaPage() {
  await requireAction("financeiro", "criar");
  const company = await getCompany();
  const configurado = Boolean(company.sicoveFornecedor && company.sicoveComunicado);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Conferência da fatura"
        description="Comunicação de venda: o que a prestadora cobrou contra o que o sistema registrou"
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/parametros/comunicacao-venda" variant="secondary">
              ⚙️ Valores
            </LinkButton>
            <LinkButton href="/financeiro/a-pagar" variant="secondary">
              ← Contas a pagar
            </LinkButton>
          </div>
        }
      />

      {!configurado ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A prestadora e os valores ainda não foram configurados. Dá para conferir a fatura assim
          mesmo, mas o botão de lançar os faltantes precisa deles —{" "}
          <strong>Parâmetros › Comunicação de venda</strong>.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Conferir"
          description="Todo mês, quando a fatura e o boleto chegam: a fatura tem que bater com os títulos do sistema, e os dois juntos unificam o mês num pagamento só."
        />
        <div className="p-5">
          <FaturaConferencia />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Comprovante de um carro sem ficha no sistema"
          description="Quando não há onde anexar: o carro foi vendido antes da implantação, ou a loja entrou só como agente da comunicação."
        />
        <div className="p-5">
          <ComprovanteAvulso />
          <p className="mt-2 text-xs text-slate-500">
            Achando a placa em um carro cadastrado, a cobrança entra como <strong>custo dele</strong>{" "}
            — pós-venda, se já vendido —, como sempre. Só quando a placa <strong>não existe no
            sistema</strong> ela entra como despesa administrativa, sem vínculo com carro nenhum. O
            comprovante fica anexado ao título e, quando há ficha, também nela.
          </p>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="O que a conferência responde" />
        <ul className="space-y-2 p-5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-900">Cobraram algo que não lancei?</strong> Serviço na
            fatura sem título no sistema — normalmente comprovante que ninguém anexou. Um clique
            lança todos, cada um no veículo da placa.
          </li>
          <li>
            <strong className="text-slate-900">Cobraram valor diferente?</strong> Título lançado com
            valor que não bate com o da fatura — reajuste que ninguém atualizou, ou cobrança errada.
          </li>
          <li>
            <strong className="text-slate-900">Lancei algo que não veio na fatura?</strong> Título do
            mês que a prestadora não cobrou. Pode ser serviço que cai na fatura seguinte — ou
            lançamento a mais.
          </li>
          <li>
            <strong className="text-slate-900">Como pago um boleto só?</strong> Anexando também o
            boleto, um clique une os títulos do mês num borderô — cada carro continua com o seu
            custo, mas Contas a pagar passa a mostrar um pagamento único, com os dois PDFs junto.
          </li>
          <li className="pt-1 text-xs text-slate-500">
            O valor de cada serviço lançado vem sempre dos Parâmetros, nunca do arquivo — a fatura
            diz o que foi feito, a configuração diz quanto custa.
          </li>
        </ul>
      </Card>
    </div>
  );
}
