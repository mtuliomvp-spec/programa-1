"use client";

import FixDateButton from "@/components/FixDateButton";
import { correctReceivedDateAction } from "../a-receber/actions";
import { correctPaymentDateAction } from "../a-pagar/actions";

/**
 * Invólucro cliente do "Corrigir data" para o Livro caixa: a página é um
 * componente de servidor e não pode passar uma função de callback adiante, então
 * a escolha entre recebimento e pagamento é feita aqui.
 */
export default function FixEntryDateButton({
  kind,
  id,
  currentDate,
}: {
  kind: "entrada" | "saida";
  id: string;
  currentDate: string;
}) {
  return (
    <FixDateButton
      currentDate={currentDate}
      kind={kind === "entrada" ? "recebimento" : "pagamento"}
      onSave={(d) => (kind === "entrada" ? correctReceivedDateAction(id, d) : correctPaymentDateAction(id, d))}
    />
  );
}
