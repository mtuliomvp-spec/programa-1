"use client";

import { useTransition } from "react";
import { decideRequestAction, cancelRequestAction } from "./actions";

export default function RequestRowActions({
  id,
  status,
  canApprove,
  canCreate,
}: {
  id: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA" | "CONCLUIDA" | "CANCELADA";
  canApprove: boolean;
  canCreate: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (status !== "PENDENTE") return null;

  return (
    <div className="flex items-center justify-end gap-3 text-sm font-medium">
      {canApprove ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => decideRequestAction(id, true))}
            className="text-emerald-700 hover:underline disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const notes = prompt("Motivo da rejeição (opcional):") || undefined;
              startTransition(() => decideRequestAction(id, false, notes));
            }}
            className="text-rose-600 hover:underline disabled:opacity-50"
          >
            Rejeitar
          </button>
        </>
      ) : null}
      {canCreate ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Cancelar esta solicitação?")) {
              startTransition(() => cancelRequestAction(id));
            }
          }}
          className="text-slate-500 hover:underline disabled:opacity-50"
        >
          Cancelar
        </button>
      ) : null}
    </div>
  );
}
