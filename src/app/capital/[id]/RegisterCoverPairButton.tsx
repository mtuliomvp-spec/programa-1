"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarParCoberturaAction } from "../actions";

/**
 * Cobertura feita antes de existir o registro no livro caixa: lança o par
 * (entrada e saída iguais na conta de Aplicação), na data do caixa aberto.
 */
export default function RegisterCoverPairButton({ swapGroup }: { swapGroup: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="block">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErro(null);
            const r = await registrarParCoberturaAction(swapGroup);
            if (!r.ok) setErro(r.error || "Não foi possível registrar.");
            else router.refresh();
          })
        }
        className="text-[11px] font-medium text-blue-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Lançando..." : "📒 Lançar no livro caixa"}
      </button>
      {erro ? <span className="block text-[11px] text-rose-600">{erro}</span> : null}
    </span>
  );
}
