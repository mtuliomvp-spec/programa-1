"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@/components/ui";
import { resetSystemDataAction, type ResetState } from "./actions";

export default function SystemActions({ backupsInfo }: { backupsInfo: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetSystemDataAction,
    {},
  );
  const [showReset, setShowReset] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Backup: baixa o JSON pela rota (abre em nova aba/baixa direto) */}
        <a
          href="/sistema/backup"
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          💾 Fazer backup agora
        </a>
        <button
          type="button"
          onClick={() => setShowReset((v) => !v)}
          className="flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
        >
          🗑️ Zerar dados do sistema
        </button>
      </div>
      <p className="text-xs text-slate-500">{backupsInfo}</p>

      {showReset ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-800">
            Atenção: isto apaga TODOS os dados operacionais.
          </p>
          <p className="mt-1 text-sm text-rose-700">
            Veículos, vendas, peças, contas a pagar/receber, caixas, capital, folha — tudo será
            apagado. <strong>Usuários e os parâmetros da empresa são mantidos.</strong> Esta ação
            não pode ser desfeita. Faça um backup antes!
          </p>
          <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-rose-800">
                Digite ZERAR para confirmar
              </label>
              <Input name="confirm" placeholder="ZERAR" className="w-40 uppercase" autoComplete="off" />
            </div>
            <Button
              type="submit"
              disabled={pending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {pending ? "Zerando..." : "Confirmar e zerar"}
            </Button>
            <button
              type="button"
              onClick={() => setShowReset(false)}
              className="text-sm text-slate-500 hover:underline"
            >
              Cancelar
            </button>
          </form>
          {state.error ? <p className="mt-2 text-sm font-medium text-rose-700">{state.error}</p> : null}
        </div>
      ) : null}

      {state.success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </div>
      ) : null}
    </div>
  );
}
