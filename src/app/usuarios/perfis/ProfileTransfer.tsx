"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";
import { importProfilesAction, type ProfileFormState } from "./actions";

/**
 * Levar os perfis de uma instalação para outra. Cada loja tem o seu banco, então
 * exportar/importar é o único jeito de repetir exatamente os mesmos perfis na
 * demonstração e em cada instalação nova.
 */
export default function ProfileTransfer({ total }: { total: number }) {
  const [state, formAction, pending] = useActionState(importProfilesAction, {} as ProfileFormState);
  const [aberto, setAberto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Cada instalação tem o seu próprio banco de dados. Para repetir os mesmos perfis em outra
        (demonstração, cliente novo), exporte aqui e importe lá.
      </p>

      {total > 0 ? (
        // Rota de download (route handler), não uma página: precisa de <a> para
        // o navegador baixar o arquivo. O lint confunde com a página [id].
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a
          href="/usuarios/perfis/exportar"
          className="block w-full rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ⬇️ Exportar perfis ({total})
        </a>
      ) : (
        <p className="rounded-lg border border-slate-200 px-4 py-2 text-center text-sm italic text-slate-500">
          Nenhum perfil para exportar ainda.
        </p>
      )}

      {aberto ? (
        <form ref={formRef} action={formAction} className="space-y-3 rounded-lg border border-slate-200 p-3">
          {state.error ? <p className="text-sm font-medium text-rose-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm font-medium text-emerald-700">{state.success}</p> : null}
          <Field label="Arquivo de perfis (.json)" required>
            <input
              type="file"
              name="file"
              accept=".json,application/json"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </Field>
          <p className="text-xs text-slate-500">
            Perfil com o mesmo nome tem as permissões <strong>substituídas</strong> pelas do arquivo (e os
            usuários dele são atualizados junto); os que não existem são criados. Nenhum perfil é excluído.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Importando..." : "Importar"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAberto(true)} className="w-full">
          ⬆️ Importar perfis de outra instalação
        </Button>
      )}
    </div>
  );
}
