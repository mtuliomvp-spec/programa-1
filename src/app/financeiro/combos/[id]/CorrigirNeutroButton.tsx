"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { corrigirComboParaNeutroAction } from "../actions";

/**
 * Combo pago com abatimento no formato antigo (aporte e títulos na conta que
 * pagou): passa para o Banco Neutro, e a conta fica só com o que saiu de fato.
 */
export default function CorrigirNeutroButton({
  comboId,
  conta,
  saiu,
}: {
  comboId: string;
  conta: string;
  /** Quanto saiu de verdade da conta (total − abatimento), já formatado. */
  saiu: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function corrigir() {
    setErro(null);
    start(async () => {
      const r = await corrigirComboParaNeutroAction(comboId);
      if (!r.ok) {
        setErro(r.error || "Não foi possível corrigir.");
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <div className="print:hidden mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
      <p className="text-xs text-amber-800">
        Lançado no formato antigo: o aporte e os títulos estão em <strong>{conta}</strong>, e o livro caixa
        dela mostra uma entrada que não houve. A correção leva o aporte e os títulos para o{" "}
        <strong>Banco Neutro</strong> e deixa em {conta} só a transferência de <strong>{saiu}</strong> — o
        que saiu de fato. Saldos, capital e resultado não mudam.
      </p>
      {confirmando ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={corrigir}
            disabled={pending}
            className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Corrigindo…" : "Confirmar correção"}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} className="text-xs text-slate-500 hover:underline">
            Voltar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="mt-2 h-8 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-500"
        >
          Corrigir lançamento (Banco Neutro)
        </button>
      )}
      {erro ? <p className="mt-1 text-xs text-rose-600">{erro}</p> : null}
    </div>
  );
}
