"use client";

import { useTransition } from "react";
import { setConsortiumStatusAction, deleteConsortiumAction } from "./actions";

export default function ConsortiumActions({
  id,
  status,
}: {
  id: string;
  status: "ATIVO" | "CONTEMPLADO" | "ENCERRADO";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 text-sm font-medium">
      {status === "ATIVO" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Marcar como contemplado? As parcelas continuam sendo geradas até o fim.")) {
              startTransition(() => setConsortiumStatusAction(id, "CONTEMPLADO"));
            }
          }}
          className="text-emerald-700 hover:underline disabled:opacity-50"
        >
          🎉 Contemplado
        </button>
      ) : null}
      {status !== "ENCERRADO" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Encerrar consórcio? As parcelas pendentes serão removidas das contas a pagar.")) {
              startTransition(() => setConsortiumStatusAction(id, "ENCERRADO"));
            }
          }}
          className="text-slate-500 hover:underline disabled:opacity-50"
        >
          Encerrar
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Excluir este consórcio do histórico? Parcelas já pagas permanecem no financeiro.")) {
              startTransition(() => deleteConsortiumAction(id));
            }
          }}
          className="text-rose-600 hover:underline disabled:opacity-50"
        >
          Excluir
        </button>
      )}
    </div>
  );
}
