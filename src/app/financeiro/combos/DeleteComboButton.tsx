"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteComboAction } from "./actions";

export default function DeleteComboButton({ comboId, comboName }: { comboId: string; comboName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      const r = await deleteComboAction(comboId);
      if (!r.ok) {
        alert(r.error || "Não foi possível excluir.");
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-slate-500">Excluir “{comboName}”?</span>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {pending ? "..." : "Sim"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Não
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs font-medium text-rose-600 hover:underline"
    >
      Excluir
    </button>
  );
}
