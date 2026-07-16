"use client";

import { useState, useTransition } from "react";
import { reverseFinancingAction, reverseReturnAction } from "./actions";

/**
 * Estorna a baixa do financiamento ou do retorno: desfaz a transferência da
 * financeira para a empresa e devolve a venda ao estado "a receber". Pede
 * confirmação antes (é uma correção que mexe nos saldos).
 */
export default function ReverseSettleButton({
  saleId,
  mode,
}: {
  saleId: string;
  mode: "financing" | "return";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doReverse() {
    setError(null);
    start(async () => {
      const res = mode === "return" ? await reverseReturnAction(saleId) : await reverseFinancingAction(saleId);
      if (!res.ok) setError(res.error || "Erro ao estornar.");
      else setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[11px] font-medium text-rose-600 hover:underline"
      >
        ↩︎ Estornar
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[11px] text-slate-500">Desfazer a baixa?</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={doReverse}
          className="text-[11px] font-semibold text-rose-700 hover:underline disabled:opacity-50"
        >
          {pending ? "Estornando..." : "Sim, estornar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[11px] text-slate-400 hover:underline"
        >
          não
        </button>
      </div>
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
