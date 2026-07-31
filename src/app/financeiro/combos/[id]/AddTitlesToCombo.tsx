"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button } from "@/components/ui";
import { addPayablesToComboAction, removePayableFromComboAction } from "../actions";

type Row = { id: string; description: string; supplier: string; dueDate: string; amount: number };

export default function AddTitlesToCombo({ comboId, available }: { comboId: string; available: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function add() {
    const ids = [...selected];
    if (!ids.length) return;
    setMsg(null);
    start(async () => {
      const r = await addPayablesToComboAction(comboId, ids);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível adicionar.");
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  if (available.length === 0) {
    return <p className="px-1 py-3 text-sm text-slate-500">Nenhum título pendente disponível para adicionar.</p>;
  }

  return (
    <div>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
        {available.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-800">{r.description}</span>
              <span className="block truncate text-xs text-slate-400">
                {r.supplier} · vence {formatDate(r.dueDate)}
              </span>
            </span>
            <span className="tabular-nums text-slate-700">{formatCurrency(r.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <Button className="h-9" disabled={pending || selected.size === 0} onClick={add}>
          Adicionar {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
        {msg ? <p className="text-sm text-rose-600">{msg}</p> : null}
      </div>
    </div>
  );
}

export function RemoveFromCombo({ payableId }: { payableId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await removePayableFromComboAction(payableId);
          if (!r.ok) {
            alert(r.error || "Não foi possível remover.");
            return;
          }
          router.refresh();
        })
      }
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 print:hidden"
    >
      Remover
    </button>
  );
}
