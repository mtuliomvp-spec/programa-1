"use client";

import { useTransition } from "react";
import { deleteCashEntryAction } from "./actions";

export default function DeleteCashEntryButton({
  kind,
  id,
}: {
  kind: "entrada" | "saida";
  id: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Excluir este lançamento? O saldo do caixa será recalculado.")) {
          startTransition(async () => {
            try {
              await deleteCashEntryAction(kind, id);
            } catch (e) {
              alert(e instanceof Error ? e.message : "Não foi possível excluir.");
            }
          });
        }
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 print:hidden"
    >
      Excluir
    </button>
  );
}
