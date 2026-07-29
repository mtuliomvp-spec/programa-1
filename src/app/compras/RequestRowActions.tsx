"use client";

import { useTransition } from "react";
import Link from "next/link";
import { decideRequestAction, cancelRequestAction, deleteRequestAction } from "./actions";

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

  function excluir() {
    if (!confirm("Excluir esta solicitação? Esta ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const res = await deleteRequestAction(id);
      if (!res.ok) alert(res.error || "Não foi possível excluir.");
    });
  }

  if (status === "PENDENTE") {
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
          <>
            <Link href={`/compras/${id}/editar`} className="text-blue-700 hover:underline">
              Editar
            </Link>
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
            <button
              type="button"
              disabled={pending}
              onClick={excluir}
              className="text-rose-600 hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
          </>
        ) : null}
      </div>
    );
  }

  if (status === "APROVADA" && canCreate) {
    return (
      <div className="flex items-center justify-end gap-3 text-sm font-medium">
        <Link href={`/compras/${id}/editar`} className="text-blue-700 hover:underline">
          Editar
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={excluir}
          className="text-rose-600 hover:underline disabled:opacity-50"
        >
          Excluir
        </button>
      </div>
    );
  }

  return null;
}
