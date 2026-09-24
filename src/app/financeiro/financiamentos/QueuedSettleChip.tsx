"use client";

import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { tirarDaFilaAction } from "./actions";

/**
 * Repasse/retorno informado à frente do movimento: no lugar do "Receber", a
 * linha mostra que o dinheiro já caiu e espera o caixa daquele dia. O "tirar
 * da fila" desfaz o informe (nada foi creditado ainda).
 */
export default function QueuedSettleChip({
  saleId,
  tipo,
  data,
  valor,
  conta,
  podeTirar,
}: {
  saleId: string;
  tipo: "financiamento" | "retorno";
  /** ISO da data do crédito. */
  data: string;
  valor: number;
  conta: string | null;
  podeTirar: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        Aguardando caixa {formatDate(data)}
      </span>
      <span className="text-[11px] text-slate-500">
        +{formatCurrency(valor)}
        {conta ? ` em ${conta}` : ""}
      </span>
      {podeTirar ? (
        confirmando ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] text-slate-500">Tirar da fila? Nada foi creditado ainda.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErro(null);
                    const r = await tirarDaFilaAction(saleId, tipo);
                    if (!r.ok) setErro(r.error || "Não foi possível tirar da fila.");
                    else setConfirmando(false);
                  })
                }
                className="text-[11px] font-semibold text-rose-700 hover:underline disabled:opacity-50"
              >
                {pending ? "Tirando..." : "Sim, tirar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="text-[11px] text-slate-400 hover:underline"
              >
                não
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:underline"
          >
            tirar da fila
          </button>
        )
      ) : null}
      {erro ? <p className="text-[11px] text-rose-600">{erro}</p> : null}
    </div>
  );
}
