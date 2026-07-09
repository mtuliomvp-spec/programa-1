"use client";

import { useTransition } from "react";
import { markReceivedAction, markPendingAction } from "./actions";

export default function ReceivableRowActions({ id, status }: { id: string; status: "PENDENTE" | "RECEBIDO" | "ATRASADO" }) {
  const [pending, startTransition] = useTransition();

  if (status === "RECEBIDO") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => markPendingAction(id))}
        className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-50"
      >
        Reverter
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => markReceivedAction(id))}
      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
    >
      {pending ? "Salvando..." : "Marcar como recebido"}
    </button>
  );
}
