"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReceivableAction } from "./actions";

/**
 * Excluir um título a receber. A pergunta é feita na própria linha (sem o
 * confirm/alert do navegador, que não abrem em todo lugar — o clique voltava
 * como "cancelar" e o botão parecia não fazer nada), e o erro aparece ali.
 */
export default function DeleteReceivableButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!confirmando) {
    return (
      <span className="inline-flex flex-col items-start print:hidden">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErro(null);
            setConfirmando(true);
          }}
          className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
        >
          Excluir
        </button>
        {erro ? <span className="mt-0.5 max-w-40 text-[11px] text-rose-600">{erro}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1 print:hidden">
      <span className="text-[11px] text-slate-500">Excluir este título?</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await deleteReceivableAction(id);
              setConfirmando(false);
              if (!r.ok) {
                setErro(r.error || "Não foi possível excluir.");
                return;
              }
              router.refresh();
            })
          }
          className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50"
        >
          {pending ? "Excluindo..." : "Sim"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmando(false)}
          className="text-xs text-slate-400 hover:underline"
        >
          não
        </button>
      </span>
    </span>
  );
}
