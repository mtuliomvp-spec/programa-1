"use client";

import { useState } from "react";
import { perguntar } from "@/lib/confirmar";
import { abonarFotoClienteAction } from "./actions";
import { useAbono } from "./AbonoContexto";

/**
 * Botão "Abonar" da pendência de foto do cliente: um veículo (na linha) ou
 * todos os da lista (no cabeçalho do cartão).
 */
export default function AbonarFoto({ vehicleIds, todos = false }: { vehicleIds: string[]; todos?: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);
  const pending = enviando;
  const abono = useAbono();
  const [erro, setErro] = useState<string | null>(null);

  async function abonar() {
    const ok = await perguntar(
      todos
        ? `Abonar a foto do cliente dos ${vehicleIds.length} veículo(s) da lista? A pendência some e o selo passa a "Foto do cliente abonada". Se a foto for anexada depois, ela vale normalmente.`
        : "Abonar a foto do cliente deste veículo? A pendência some e o selo passa a “Foto do cliente abonada”.",
      { confirmar: todos ? "Abonar todas" : "Abonar", perigo: false },
    );
    if (!ok) return;
    setErro(null);
    setEnviando(true);
    const r = await abonarFotoClienteAction(vehicleIds).catch(() => ({
      ok: false,
      error: "Não foi possível abonar. Tente de novo.",
    }));
    setEnviando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível abonar.");
      return;
    }
    setFeito(true);
    // Some da lista na hora (a action também revalida Pendências e Estoque).
    abono?.ocultar(vehicleIds);
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={abonar}
        disabled={pending || feito}
        className={
          todos
            ? "rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            : "rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
        }
      >
        {feito ? "✓ abonada" : pending ? "abonando…" : todos ? `Abonar todas (${vehicleIds.length})` : "Abonar"}
      </button>
      {erro ? <span className="mt-0.5 max-w-xs text-right text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
