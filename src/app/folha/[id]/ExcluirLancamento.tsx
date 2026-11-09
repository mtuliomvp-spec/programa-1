"use client";

import { useState, useTransition } from "react";
import { perguntar } from "@/lib/confirmar";
import { excluirFeriasAction, excluirRescisaoAction } from "../actions";

/** Exclui férias ou desfaz a rescisão (as contas a pagar não pagas saem junto). */
export default function ExcluirLancamento({ tipo, id }: { tipo: "ferias" | "rescisao"; id: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pendente}
        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
        onClick={async () => {
          const ok = await perguntar(
            tipo === "ferias"
              ? "Excluir estas férias? A conta a pagar sai junto, se ainda não foi paga."
              : "Desfazer a rescisão? As contas a pagar não pagas saem e o funcionário volta a ficar ativo.",
          );
          if (!ok) return;
          iniciar(async () => {
            const r = tipo === "ferias" ? await excluirFeriasAction(id) : await excluirRescisaoAction(id);
            if (r.error) setErro(r.error);
            else window.location.reload();
          });
        }}
      >
        {tipo === "ferias" ? "Excluir" : "Desfazer rescisão"}
      </button>
      {erro ? <span className="mt-1 max-w-[240px] text-right text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
