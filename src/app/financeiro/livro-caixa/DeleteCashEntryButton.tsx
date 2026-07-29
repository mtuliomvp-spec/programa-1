"use client";

import { useTransition } from "react";
import { deleteCashEntryAction } from "./actions";

export default function DeleteCashEntryButton({
  kind,
  id,
  avulso = true,
}: {
  kind: "entrada" | "saida";
  id: string;
  avulso?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // Avulso = dinheiro lançado direto no caixa → exclui de vez.
  // Título (não avulso) → estorna: volta a PENDENTE no Contas a pagar/receber.
  const label = avulso ? "Excluir" : "Estornar";
  const confirmMsg = avulso
    ? "Excluir este lançamento? O saldo do caixa será recalculado."
    : `Estornar esta baixa? O título volta para ${kind === "entrada" ? "Contas a receber" : "Contas a pagar"} como pendente.`;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(confirmMsg)) {
          startTransition(async () => {
            try {
              await deleteCashEntryAction(kind, id);
            } catch (e) {
              alert(e instanceof Error ? e.message : "Não foi possível concluir.");
            }
          });
        }
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 print:hidden"
    >
      {label}
    </button>
  );
}
