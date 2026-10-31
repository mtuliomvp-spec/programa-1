import { requireAction, requireModule } from "@/lib/guards";
import { LinkButton, PageHeader } from "@/components/ui";
import RentContractForm from "./RentContractForm";

export const dynamic = "force-dynamic";

export default async function ContratoLocacaoPage() {
  await requireModule("financeiro");
  await requireAction("financeiro", "contratolocacao");

  // Começa em branco: cada instalação é de uma loja, e o contrato de uma não
  // pode aparecer pré-preenchido na outra. Primeiro vencimento sugerido: dia 10
  // do mês que vem.
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const defaults = {
    locador: "",
    valorAluguel: 0,
    descontoMensal: 0,
    mesesDesconto: 0,
    totalMeses: 12,
    mesesCarencia: 0,
    primeiroVencimento: iso(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 10))),
    diaVencimento: 10,
    caucaoValor: 0,
    caucaoData: iso(hoje),
  };

  return (
    <div>
      <PageHeader
        title="Contrato de locação → Contas a pagar"
        description="Monte o cronograma do aluguel (com desconto, carência e caução) e gere os títulos de uma vez."
        action={
          <LinkButton href="/financeiro/a-pagar" variant="secondary">
            ← Contas a pagar
          </LinkButton>
        }
      />
      <RentContractForm defaults={defaults} />
    </div>
  );
}
