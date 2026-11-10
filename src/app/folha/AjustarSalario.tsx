"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { ajustarSalarioAction } from "./actions";

/** Digita o líquido do holerite de um funcionário (o saldo desconta os vales). */
export default function AjustarSalario({
  employeeId,
  competencia,
  valor,
}: {
  employeeId: string;
  competencia: string;
  valor: number | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(valor ? valor.toFixed(2).replace(".", ",") : "");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!aberto) {
    return (
      <span className="inline-flex flex-col items-end">
        <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-blue-700 hover:underline">
          {valor === null ? "Lançar holerite" : "Ajustar pelo holerite"}
        </button>
        {msg ? <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.t}</span> : null}
      </span>
    );
  }
  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(ev) => {
        ev.preventDefault();
        startTransition(async () => {
          const r = await ajustarSalarioAction(employeeId, competencia, texto);
          setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: r.ok ?? "Ajustado." });
          if (!r.error) setAberto(false);
        });
      }}
    >
      <span className="text-xs text-slate-500">Líquido do holerite (R$)</span>
      <div className="flex items-center gap-1">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          inputMode="decimal"
          placeholder="1.650,77"
          className="w-28 text-right"
          autoFocus
        />
        <Button type="submit" className="px-2.5 py-1.5" disabled={pending}>
          {pending ? "…" : "OK"}
        </Button>
        <Button type="button" variant="secondary" className="px-2.5 py-1.5" onClick={() => setAberto(false)}>
          ✕
        </Button>
      </div>
      {msg && !msg.ok ? <span className="max-w-xs text-right text-xs text-rose-600">{msg.t}</span> : null}
    </form>
  );
}
