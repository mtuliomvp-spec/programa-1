"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desfazerAbatimentoDoComboAction } from "../actions";

/**
 * "O beneficiário recebeu o valor integral": apaga o aporte (e o recebível que
 * o acompanha) de um combo já pago, sem mexer nos títulos.
 *
 * Serve para o combo que abateu saldo devedor mas, no banco, saiu inteiro — o
 * aporte nunca existiu, e enquanto ele estiver lá o saldo da conta fica maior
 * que o do extrato e a dívida de capital aparece menor do que é.
 */
export default function UndoAbatementButton({
  comboId,
  amount,
  beneficiaryName,
}: {
  comboId: string;
  /** Quanto foi abatido (só para o texto da confirmação). */
  amount: string;
  beneficiaryName?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function desfazer() {
    setConfirmando(false);
    setErro(null);
    start(async () => {
      const r = await desfazerAbatimentoDoComboAction(comboId);
      if (!r.ok) {
        setErro(r.error || "Não foi possível desfazer.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="print:hidden mt-2">
      {confirmando ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-700">
            Desfazer o abatimento de {amount}? O aporte some, o saldo devedor
            {beneficiaryName ? ` de ${beneficiaryName}` : ""} volta ao que era e a conta deixa de
            receber de volta esse dinheiro — fica como um pagamento integral. Os títulos continuam
            pagos.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={desfazer}
              disabled={pending}
              className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? "Desfazendo..." : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={pending}
              className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pending}
          className="text-xs font-semibold text-amber-800 underline hover:text-amber-900 disabled:opacity-50"
        >
          Recebeu o valor integral? Desfazer o abatimento
        </button>
      )}
      {erro ? <p className="mt-1 text-xs text-rose-600">{erro}</p> : null}
    </div>
  );
}
