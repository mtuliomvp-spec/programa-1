"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { corrigirSinaisForaDaVendaAction } from "../actions";

/** Corrige a venda que tratou um sinal ainda não creditado como pago à vista. */
export default function CorrigirSinalButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function corrigir() {
    setErro(null);
    start(async () => {
      const r = await corrigirSinaisForaDaVendaAction(saleId);
      if (!r.ok) {
        setErro(r.error || "Não foi possível corrigir.");
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={corrigir}
            disabled={pending}
            className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Corrigindo…" : "Confirmar correção"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="text-xs text-slate-500 hover:underline"
          >
            Voltar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500"
        >
          Corrigir: manter o sinal a receber
        </button>
      )}
      {erro ? <p className="mt-2 text-xs text-rose-600">{erro}</p> : null}
    </div>
  );
}
