"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleRecurringAction, deleteRecurringAction } from "./actions";

export default function RecurringRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-3 text-sm font-medium">
      <Link href={`/financeiro/recorrentes/${id}/editar`} className="text-slate-600 hover:underline">
        Editar
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => toggleRecurringAction(id, !active))}
        className="text-blue-700 hover:underline disabled:opacity-50"
      >
        {active ? "Pausar" : "Reativar"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("Excluir esta recorrência? As contas já geradas permanecem no financeiro.")) {
            startTransition(() => deleteRecurringAction(id));
          }
        }}
        className="text-rose-600 hover:underline disabled:opacity-50"
      >
        Excluir
      </button>
    </div>
  );
}
