"use client";

import { useState, useTransition } from "react";
import { generateNowAction } from "./actions";

export default function GenerateNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {msg ? <span className="text-xs font-medium text-slate-500">{msg}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const r = await generateNowAction();
            if (!r.ok) setMsg(r.error || "Erro ao gerar.");
            else setMsg(r.created ? `${r.created} título(s) gerado(s)` : "Nenhum novo título");
          });
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        ⚡ {pending ? "Gerando..." : "Gerar agora"}
      </button>
    </div>
  );
}
