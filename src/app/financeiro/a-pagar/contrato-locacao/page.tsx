import { requireAction } from "@/lib/guards";
import { LinkButton, PageHeader } from "@/components/ui";
import RentContractForm from "./RentContractForm";

export const dynamic = "force-dynamic";

export default async function ContratoLocacaoPage() {
  await requireAction("financeiro", "criar");

  // Pré-preenchido com o contrato atual (Leonardo × MVP); editável e reutilizável.
  const defaults = {
    locador: "Leonardo Costa de Souza",
    valorAluguel: 4500,
    descontoMensal: 1000,
    mesesDesconto: 48,
    totalMeses: 60,
    mesesCarencia: 4,
    primeiroVencimento: "2026-08-10",
    diaVencimento: 10,
    caucaoValor: 4500,
    caucaoData: "2026-07-10",
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
