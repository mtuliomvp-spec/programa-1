"use client";

import { useState, useTransition, useActionState } from "react";
import {
  decideRequestAction,
  cancelRequestAction,
  concludeRequestAction,
  type ComprasFormState,
} from "./actions";
import { Button, Input, Select } from "@/components/ui";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";

export default function RequestRowActions({
  id,
  status,
  isAdmin,
  structuralKey,
}: {
  id: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA" | "CONCLUIDA" | "CANCELADA";
  isAdmin: boolean;
  structuralKey?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showConclude, setShowConclude] = useState(false);
  const [state, formAction, concludePending] = useActionState(
    async (prev: ComprasFormState, formData: FormData) => {
      const result = await concludeRequestAction(prev, formData);
      if (result.success) setShowConclude(false);
      return result;
    },
    {} as ComprasFormState,
  );

  if (status === "PENDENTE") {
    return (
      <div className="flex items-center justify-end gap-3 text-sm font-medium">
        {isAdmin ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => decideRequestAction(id, true))}
              className="text-emerald-700 hover:underline disabled:opacity-50"
            >
              Aprovar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const notes = prompt("Motivo da rejeição (opcional):") || undefined;
                startTransition(() => decideRequestAction(id, false, notes));
              }}
              className="text-rose-600 hover:underline disabled:opacity-50"
            >
              Rejeitar
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Cancelar esta solicitação?")) {
                startTransition(() => cancelRequestAction(id));
              }
            }}
            className="text-slate-500 hover:underline disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>
    );
  }

  if (status === "APROVADA") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {showConclude ? (
          <form action={formAction} className="flex flex-col items-end gap-1.5">
            <input type="hidden" name="requestId" value={id} />
            <Input
              name="finalAmount"
              type="number"
              step="0.01"
              min={0.01}
              required
              placeholder="Valor final"
              className="h-8 w-32 text-xs"
            />
            <Select name="category" defaultValue="OUTROS" className="h-8 w-40 py-1 text-xs">
              <option value="OUTROS">Outros</option>
              <option value="COMPRA_PECA">Compra de peças</option>
              <option value="DESPESA_OPERACIONAL">Despesa operacional</option>
              <option value="COMBUSTIVEL">Combustível</option>
            </Select>
            <Select
              name="structuralKey"
              defaultValue={structuralKey || "ADMINISTRATIVO"}
              className="h-8 w-40 py-1 text-xs"
            >
              {STRUCTURAL_FLOWS.map((f) => (
                <option key={f.key} value={f.key}>
                  Fluxo: {f.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" name="alreadyPaid" value="true" defaultChecked className="h-3.5 w-3.5" />
              Já pago
            </label>
            <Button type="submit" disabled={concludePending} className="h-8 px-2.5 text-xs">
              {concludePending ? "Lançando..." : "Confirmar"}
            </Button>
            {state.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowConclude(true)}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Concluir compra
          </button>
        )}
      </div>
    );
  }

  return null;
}
