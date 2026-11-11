"use client";

import { useState } from "react";
import { perguntar } from "@/lib/confirmar";
import { abonarRenaveAction } from "./abono-renave-actions";

/**
 * Abonar as pendências do Renave de veículos VENDIDOS: um (na ficha) ou todos
 * os vendidos da lista do estoque. `desfazer` volta a cobrar.
 */
export default function AbonarRenave({
  vehicleIds,
  todos = false,
  desfazer = false,
  className,
}: {
  vehicleIds: string[];
  todos?: boolean;
  desfazer?: boolean;
  className?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar() {
    const ok = await perguntar(
      desfazer
        ? "Desfazer o abono do Renave deste veículo? As pendências voltam a aparecer no selo do estoque."
        : todos
          ? `Abonar as pendências do Renave dos ${vehicleIds.length} veículo(s) vendido(s) da lista? O selo passa a "Renave abonado" e eles saem do filtro "Renave: dados faltando". Nenhum dado é apagado.`
          : 'Abonar as pendências do Renave deste veículo vendido? O selo passa a "Renave abonado". Nenhum dado é apagado.',
      { confirmar: desfazer ? "Desfazer abono" : todos ? "Abonar todos" : "Abonar", perigo: false },
    );
    if (!ok) return;
    setErro(null);
    setEnviando(true);
    const r = await abonarRenaveAction(vehicleIds, desfazer).catch(() => ({
      ok: false,
      error: "Não foi possível concluir. Recarregue a página e tente de novo.",
    }));
    setEnviando(false);
    if (!r.ok) {
      setErro(r.error ?? "Não foi possível concluir.");
      return;
    }
    location.reload();
  }

  return (
    <span className={`inline-flex flex-col items-start ${className ?? ""}`}>
      <button
        type="button"
        onClick={executar}
        disabled={enviando}
        className={
          desfazer
            ? "rounded-md px-2 py-1 text-xs font-medium text-slate-500 underline hover:text-slate-800 disabled:opacity-50"
            : "rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
        }
      >
        {enviando
          ? desfazer
            ? "desfazendo…"
            : "abonando…"
          : desfazer
            ? "Desfazer abono"
            : todos
              ? `📒 Abonar Renave dos vendidos (${vehicleIds.length})`
              : "📒 Abonar pendências do Renave"}
      </button>
      {erro ? <span className="mt-0.5 max-w-xs text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
