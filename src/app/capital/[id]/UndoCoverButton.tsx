"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desfazerCoberturaAction } from "../actions";

/** Desfaz a cobertura do saldo livre negativo (as duas pontas da troca). */
export default function UndoCoverButton({ swapGroup }: { swapGroup: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (!confirmando) {
    return (
      <span className="block">
        <button
          type="button"
          onClick={() => {
            setErro(null);
            setConfirmando(true);
          }}
          className="text-[11px] font-medium text-rose-600 hover:underline"
        >
          ↩︎ Desfazer cobertura
        </button>
        {erro ? <span className="block text-[11px] text-rose-600">{erro}</span> : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-slate-500">A fatia volta para o sócio de antes. Desfazer?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await desfazerCoberturaAction(swapGroup);
            setConfirmando(false);
            if (!r.ok) setErro(r.error || "Não foi possível desfazer.");
            else router.refresh();
          })
        }
        className="font-semibold text-rose-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Desfazendo..." : "Sim"}
      </button>
      <button type="button" onClick={() => setConfirmando(false)} className="text-slate-400 hover:underline">
        não
      </button>
    </span>
  );
}
