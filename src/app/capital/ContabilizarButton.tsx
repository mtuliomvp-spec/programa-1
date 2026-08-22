"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { contabilizarCapitalAction } from "./actions";

/**
 * "Contabilizar" o saldo do sócio: zera o capital contra o fluxo
 * administrativo (devedor → loja absorve como despesa; credor → vira receita
 * da loja), sem movimentar dinheiro. Fica dentro do card-link do sócio, por
 * isso usa stopPropagation.
 */
export default function ContabilizarButton({
  beneficiaryId,
  name,
  saldo,
}: {
  beneficiaryId: string;
  name: string;
  saldo: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const devedor = saldo < 0;
  const confirmText = devedor
    ? `Contabilizar o saldo devedor de ${name} (${formatCurrency(saldo)})?\n\nO capital dele será zerado com um APORTE de ${formatCurrency(Math.abs(saldo))} e a loja absorverá o valor como DESPESA administrativa ("Acerto de capital"). Nenhum dinheiro se move (Banco Neutro).`
    : `Contabilizar o saldo credor de ${name} (${formatCurrency(saldo)})?\n\nO capital dele será zerado com uma RETIRADA de ${formatCurrency(saldo)} e o valor entrará como RECEITA administrativa da loja ("Acerto de capital"). Nenhum dinheiro se move (Banco Neutro).`;

  return (
    <span className="block">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMsg(null);
          if (!confirm(confirmText)) return;
          start(async () => {
            const r = await contabilizarCapitalAction(beneficiaryId);
            if (!r.ok) {
              setMsg(r.error || "Não foi possível contabilizar.");
              return;
            }
            router.refresh();
          });
        }}
        className="mt-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title={
          devedor
            ? "Zera o saldo devedor: aporte no sócio + despesa administrativa (sem mover dinheiro)"
            : "Zera o saldo credor: retirada do sócio + receita administrativa (sem mover dinheiro)"
        }
      >
        {pending ? "Contabilizando…" : "🧮 Contabilizar"}
      </button>
      {msg ? <span className="mt-1 block text-xs font-medium text-rose-600">{msg}</span> : null}
    </span>
  );
}
