"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setComboPayoutMethodAction } from "../actions";

/**
 * Escolha da forma de recebimento do combo (feita por quem solicita): conta
 * bancária cadastrada ou chave PIX da ficha do usuário.
 */
export default function PayoutMethodPicker({
  comboId,
  method,
  hasPix,
  hasConta,
}: {
  comboId: string;
  method: string | null;
  hasPix: boolean;
  hasConta: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(m: "conta" | "pix") {
    if (m === method) return;
    start(async () => {
      const r = await setComboPayoutMethodAction(comboId, m);
      if (!r.ok) {
        alert(r.error || "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  const base = "rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50";
  const on = "border-blue-600 bg-blue-600 text-white";
  const off = "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div className="print:hidden mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Como deseja receber?</span>
      <button type="button" disabled={pending} onClick={() => choose("conta")} className={`${base} ${method === "conta" ? on : off}`}>
        🏦 Conta cadastrada
      </button>
      <button type="button" disabled={pending} onClick={() => choose("pix")} className={`${base} ${method === "pix" ? on : off}`}>
        ⚡ PIX
      </button>
      {method === "pix" && !hasPix ? (
        <span className="text-xs text-amber-700">Sem chave PIX na ficha do usuário — cadastre em Usuários.</span>
      ) : null}
      {method === "conta" && !hasConta ? (
        <span className="text-xs text-amber-700">Sem dados bancários na ficha do usuário — cadastre em Usuários.</span>
      ) : null}
    </div>
  );
}
