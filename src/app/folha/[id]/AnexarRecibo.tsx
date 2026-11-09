"use client";

import { useRef, useState, useTransition } from "react";
import { anexarReciboFeriasAction } from "../actions";

/** Anexa ou troca o recibo de férias já lançadas (ex.: pagas fora do sistema). */
export default function AnexarRecibo({ id, temRecibo }: { id: string; temRecibo: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <input
        ref={ref}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return;
          const fd = new FormData();
          fd.set("id", id);
          fd.set("arquivo", arquivo);
          iniciar(async () => {
            const r = await anexarReciboFeriasAction(fd);
            if (r.error) setErro(r.error);
            else window.location.assign(`${window.location.pathname}?ok=${encodeURIComponent("Recibo anexado.")}`);
          });
        }}
      />
      <button
        type="button"
        disabled={pendente}
        onClick={() => ref.current?.click()}
        className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
      >
        {pendente ? "Anexando…" : temRecibo ? "Trocar recibo" : "📎 Anexar recibo"}
      </button>
      {erro ? <span className="mt-1 max-w-[220px] text-right text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
