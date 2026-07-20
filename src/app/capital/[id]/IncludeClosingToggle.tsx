"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleIncludeClosingAction } from "../actions";

/** Marca o beneficiário para receber o pró-labore no fechamento mensal. */
export default function IncludeClosingToggle({
  beneficiaryId,
  initial,
  hasProLabore,
}: {
  beneficiaryId: string;
  initial: boolean;
  hasProLabore: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    start(async () => {
      const r = await toggleIncludeClosingAction(beneficiaryId, next);
      if (!r.ok) {
        setChecked(!next);
        setError(r.error || "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Incluir no fechamento mensal (pró-labore)
      </label>
      <p className="mt-1 text-xs text-slate-500">
        {hasProLabore
          ? "Ao fechar o mês, o pró-labore combinado é creditado ao sócio (com contrapartida na empresa)."
          : "Defina o pró-labore combinado deste beneficiário para o crédito ocorrer no fechamento."}
      </p>
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
