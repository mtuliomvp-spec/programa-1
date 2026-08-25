import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import SicoveForm, { type SicoveConfig } from "./SicoveForm";

export const dynamic = "force-dynamic";

/**
 * Cobrança da comunicação de venda: o que a prestadora cobra por serviço e
 * quando fatura. É daqui que sai o título lançado ao anexar o comprovante na
 * ficha do carro.
 */
export default async function ComunicacaoVendaPage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");
  const company = await getCompany();

  const config: SicoveConfig = {
    sicoveFornecedor: company.sicoveFornecedor,
    sicoveComunicado: company.sicoveComunicado,
    sicoveCancelamento: company.sicoveCancelamento,
    sicoveVencimentoDia: company.sicoveVencimentoDia,
  };
  const ligado = Boolean(config.sicoveFornecedor && config.sicoveComunicado);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Comunicação de venda"
        description="Quanto a prestadora cobra por serviço e quando ela fatura"
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/financeiro/comunicacao-venda" variant="secondary">
              📄 Conferir a fatura do mês
            </LinkButton>
            <LinkButton href="/parametros" variant="secondary">
              ← Parâmetros
            </LinkButton>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Cobrança automática"
          description={
            ligado
              ? "Ligada: anexar o comprovante na ficha do carro lança o título sozinho."
              : "Desligada: preencha a prestadora e o valor para o título ser lançado sozinho."
          }
        />
        <div className="p-5">
          <SicoveForm config={config} />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Como funciona" />
        <ul className="space-y-2 p-5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-900">1.</strong> Você anexa o comprovante em{" "}
            <strong>Documentos do veículo</strong>, na ficha do carro.
          </li>
          <li>
            <strong className="text-slate-900">2.</strong> O sistema reconhece o comprovante,
            identifica se é <strong>comunicação</strong> ou <strong>cancelamento</strong> e lança um
            título com o valor daqui, vencendo no dia configurado do <strong>mês seguinte</strong> ao
            envio — que é quando a prestadora fatura.
          </li>
          <li>
            <strong className="text-slate-900">3.</strong> O título nasce <strong>vinculado ao
            veículo</strong>, então o custo entra na margem daquele carro sozinho.
          </li>
          <li>
            <strong className="text-slate-900">4.</strong> Quando o boleto único do mês chegar, marque
            os títulos em Contas a pagar e pague em lote — ou monte um{" "}
            <strong>combo de pagamento</strong>, que quita todos de uma vez.
          </li>
          <li className="pt-1 text-xs text-slate-500">
            O mesmo comprovante anexado duas vezes não cobra duas vezes: o número do registro no
            SICOVE é a identidade do serviço, e um título por número é o limite.
          </li>
        </ul>
      </Card>
    </div>
  );
}
