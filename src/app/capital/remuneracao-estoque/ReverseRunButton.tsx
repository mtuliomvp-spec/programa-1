"use client";

import { useState, useTransition } from "react";
import { reverseStockInterestAction } from "./actions";

export default function ReverseRunButton({ runId, runDate }: { runId: string; runDate: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {err ? <span className="text-xs text-rose-600">{err}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Estornar este lote? Os custos e aportes gerados serão removidos.")) return;
          setErr(null);
          start(async () => {
            const r = await reverseStockInterestAction(runId, runDate);
            if (!r.ok) setErr(r.error || "Erro ao estornar.");
          });
        }}
        className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Estornando..." : "Estornar"}
      </button>
    </div>
  );
}
