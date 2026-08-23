"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadDemoDataAction, type LoadDemoState } from "./actions";

/**
 * Botão que dispara a carga de demonstração. Confirmação obrigatória porque a
 * carga LIMPA os dados de negócio antes de recriar os fictícios.
 */
export default function LoadDemoButton({ temDados }: { temDados: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<LoadDemoState | null>(null);

  const confirmText = temDados
    ? "Recarregar os dados de demonstração?\n\nTUDO que estiver lançado neste sistema (veículos, vendas, financeiro) será APAGADO e substituído pelos dados fictícios originais.\n\nOs usuários e os Parâmetros da empresa são preservados."
    : "Carregar os dados de demonstração?\n\nO sistema será preenchido com veículos, vendas, financeiro e capital fictícios para a apresentação.";

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setState(null);
          if (!confirm(confirmText)) return;
          start(async () => {
            const r = await loadDemoDataAction();
            setState(r);
            if (r.ok) router.refresh();
          });
        }}
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending
          ? "Carregando… (pode levar até 1 minuto)"
          : temDados
            ? "🔄 Recarregar dados de demonstração"
            : "▶️ Carregar dados de demonstração"}
      </button>

      {state?.ok && state.result ? (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">Pronto! O sistema já está preenchido.</p>
          <p className="mt-1">
            {state.result.veiculos} veículos · {state.result.vendas} vendas ·{" "}
            {state.result.clientes} clientes · {state.result.socios} sócios no capital.
          </p>
          <p className="mt-1">
            Farol de integridade: <strong>{state.result.farolVerde ? "verde" : "divergente"}</strong>.
          </p>
        </div>
      ) : null}

      {state && !state.ok ? (
        <p className="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
