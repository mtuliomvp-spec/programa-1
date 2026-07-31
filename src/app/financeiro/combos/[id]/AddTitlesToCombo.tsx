"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { normalizeSearch } from "@/lib/search";
import { Button, Input } from "@/components/ui";
import { addPayablesToComboAction, removePayableFromComboAction } from "../actions";

type Row = { id: string; description: string; supplier: string; dueDate: string; amount: number };

export default function AddTitlesToCombo({ comboId, available }: { comboId: string; available: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
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

  const nq = normalizeSearch(q.trim());
  const shown = nq
    ? available.filter((r) =>
        normalizeSearch(`${r.description} ${r.supplier} ${formatCurrency(r.amount)} ${formatDate(r.dueDate)}`).includes(nq),
      )
    : available;

  if (available.length === 0) {
    return <p className="px-1 py-3 text-sm text-slate-500">Nenhum título pendente disponível para adicionar.</p>;
  }

  return (
    <div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar título (descrição, fornecedor, valor...)"
        className="mb-3 h-11 text-base"
      />
      {shown.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">Nenhum título encontrado para “{q}”.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {shown.map((r) => (
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
              <Link
                href={`/financeiro/a-pagar/${r.id}/editar`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
                title="Editar este título (abre em outra aba)"
              >
                Editar
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button className="h-9" disabled={pending || selected.size === 0} onClick={add}>
          Adicionar {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
        {selected.size > 0 ? (
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:underline">
            Limpar seleção
          </button>
        ) : null}
        {msg ? <p className="text-sm text-rose-600">{msg}</p> : null}
      </div>
    </div>
  );
}

export function RemoveFromCombo({ payableId }: { payableId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-3 print:hidden">
      <Link
        href={`/financeiro/a-pagar/${payableId}/editar`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        Editar
      </Link>
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
        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        Remover
      </button>
    </span>
  );
}
