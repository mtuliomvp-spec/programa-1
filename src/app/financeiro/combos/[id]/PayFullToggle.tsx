"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setComboPayFullAction } from "../actions";

export default function PayFullToggle({
  comboId,
  payFull,
  beneficiaryName,
}: {
  comboId: string;
  payFull: boolean;
  beneficiaryName?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const r = await setComboPayFullAction(comboId, !payFull);
      if (!r.ok) {
        alert(r.error || "Não foi possível alterar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="print:hidden mb-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {payFull ? "Pagando o valor integral" : "Abatendo o saldo devedor"}
          </p>
          <p className="text-xs text-slate-500">
            {payFull
              ? `${beneficiaryName || "O beneficiário"} recebe o total do borderô; o saldo devedor de capital NÃO será abatido.`
              : `Parte do total cobre o saldo devedor de capital${beneficiaryName ? ` de ${beneficiaryName}` : ""} (vira aporte); só a diferença sai em dinheiro.`}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            payFull
              ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
              : "bg-blue-600 text-white hover:bg-blue-500"
          }`}
        >
          {pending ? "..." : payFull ? "Voltar a abater o saldo devedor" : "Receber valor integral"}
        </button>
      </div>
    </div>
  );
}
