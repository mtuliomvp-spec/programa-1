"use client";

import { useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { passarRecorrenciaParaFolhaAction } from "./actions";

/** Escolhe o funcionário de uma recorrência de salário e a passa para a folha. */
export default function PassarRecorrencia({
  recurringId,
  sugestao,
  funcionarios,
}: {
  recurringId: string;
  sugestao: string | null;
  funcionarios: { id: string; name: string }[];
}) {
  const [employeeId, setEmployeeId] = useState(sugestao ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (msg?.ok) return <p className="text-xs text-emerald-700">{msg.t}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-auto min-w-48">
        <option value="">— de qual funcionário? —</option>
        {funcionarios.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="secondary"
        disabled={!employeeId || pending}
        onClick={() =>
          startTransition(async () => {
            const r = await passarRecorrenciaParaFolhaAction(recurringId, employeeId);
            setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: r.ok ?? "Passado para a folha." });
          })
        }
      >
        {pending ? "Passando…" : "Passar para a folha"}
      </Button>
      {msg && !msg.ok ? <span className="text-xs text-rose-600">{msg.t}</span> : null}
    </div>
  );
}
