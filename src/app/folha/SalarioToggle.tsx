"use client";

import { useTransition } from "react";
import { setRecebeSalarioAction } from "./actions";

/** Chave "recebe salário pela folha" (desligada = só comissão). */
export default function SalarioToggle({ id, on, disabled }: { id: string; on: boolean; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled || pending}
      title={on ? "Recebe salário pela folha — clique para desligar (só comissão)" : "Só comissão — clique para ligar o salário"}
      onClick={() => startTransition(() => setRecebeSalarioAction(id, !on))}
      className="inline-flex items-center gap-2 text-xs disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      <span className={on ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}>{on ? "Salário" : "Só comissão"}</span>
    </button>
  );
}
