"use client";

import { useTransition } from "react";
import { markPaidAction, markPendingAction } from "./actions";

export default function PayableRowActions({ id, status }: { id: string; status: "PENDENTE" | "PAGO" | "ATRASADO" }) {
  const [pending, startTransition] = useTransition();

  if (status === "PAGO") {
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
      onClick={() => startTransition(() => markPaidAction(id))}
      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
    >
      {pending ? "Salvando..." : "Marcar como pago"}
    </button>
  );
}
