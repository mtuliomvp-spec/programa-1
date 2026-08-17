"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_STATES,
  type ChecklistMap,
  type ChecklistState,
} from "@/lib/appraisals";
import { recordDeliveryConferenceAction, type AppraisalFormState } from "../actions";

/**
 * Conferência de entrega: re-marca o MESMO checklist da avaliação. Os itens já
 * vêm marcados com o estado da avaliação (seed) — o conferente só ajusta o que
 * mudou. Ao salvar, o sistema aponta as divergências. Não cria veículo no
 * estoque; apenas registra a conferência.
 */
export default function DeliveryConference({
  appraisalId,
  appraisalChecklist,
  existingDelivery,
  existingCheckedBy,
  existingNotes,
  alreadyDone,
}: {
  appraisalId: string;
  appraisalChecklist: ChecklistMap;
  existingDelivery: ChecklistMap | null;
  existingCheckedBy: string;
  existingNotes: string;
  alreadyDone: boolean;
}) {
  const [state, formAction, pending] = useActionState<AppraisalFormState, FormData>(
    recordDeliveryConferenceAction,
    {},
  );
  const [open, setOpen] = useState(!alreadyDone);

  // Seed: usa a marcação da entrega (se re-conferindo) ou a da avaliação.
  const seed = existingDelivery ?? appraisalChecklist;

  if (alreadyDone && !open) {
    return (
      <div className="p-5">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          Refazer conferência
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="id" defaultValue={appraisalId} />

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        Confira o veículo na entrega marcando o estado de cada item. Os itens já vêm com a marcação
        da avaliação — ajuste só o que estiver diferente. O sistema mostra as divergências ao salvar.
      </p>

      <div className="space-y-3">
        {CHECKLIST_ITEMS.map((item) => {
          const current = seed[item.key]?.state ?? "OK";
          const obs = existingDelivery?.[item.key]?.obs ?? "";
          return (
            <div
              key={item.key}
              className="grid grid-cols-1 gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                <div className="flex gap-3">
                  {CHECKLIST_STATES.map((s) => (
                    <label key={s.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                      <input
                        type="radio"
                        name={`dcl_${item.key}`}
                        value={s.value}
                        defaultChecked={current === (s.value as ChecklistState)}
                        className="h-4 w-4 border-slate-300"
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <Input
                name={`dcl_obs_${item.key}`}
                defaultValue={obs}
                placeholder="Observação (opcional)"
                className="sm:w-64"
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Conferido por">
          <Input name="checkedBy" defaultValue={existingCheckedBy} placeholder="Nome de quem conferiu" />
        </Field>
      </div>
      <Field label="Observações da conferência">
        <Textarea name="deliveryNotes" rows={2} defaultValue={existingNotes} />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Registrar conferência"}
        </Button>
        {alreadyDone ? (
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
