"use client";

import { useState, useTransition } from "react";

type Result = { ok: boolean; movedCapital?: boolean; movedVehicleCost?: boolean; error?: string };

/**
 * "Corrigir data": ajusta o dia de uma baixa já feita (recebimento ou
 * pagamento), sem desfazer nada.
 *
 * A data da baixa nunca é digitada no sistema — vem da data de trabalho do
 * caixa. Quando o caixa está no dia errado, antes só se corrigia fechando o
 * caixa, reabrindo na data certa, revertendo e refazendo a baixa (e no caminho
 * se perdia a conta escolhida).
 */
export default function FixDateButton({
  currentDate,
  kind,
  onSave,
}: {
  /** Data atual da baixa, em ISO (yyyy-mm-dd), para preencher o campo. */
  currentDate: string;
  kind: "recebimento" | "pagamento";
  onSave: (dateInput: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(currentDate);
          setError(null);
          setOpen(true);
        }}
        className="text-sm font-medium text-blue-700 hover:underline"
        title={`Corrigir o dia em que este ${kind} entrou no sistema`}
      >
        Corrigir data
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-36 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
      />
      <p className="w-52 text-left text-[11px] text-slate-500">
        Muda só o dia do {kind}. O valor, a conta e o vencimento continuam como estão.
      </p>
      {error ? <p className="w-52 text-left text-[11px] text-rose-600">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !value}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await onSave(value);
              if (!res.ok) {
                setError(res.error || "Não foi possível corrigir a data.");
                return;
              }
              setOpen(false);
            });
          }}
          className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-slate-400 hover:underline"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
