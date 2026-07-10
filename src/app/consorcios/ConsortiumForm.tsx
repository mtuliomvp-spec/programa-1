"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { createConsortiumAction, type ConsorcioFormState } from "./actions";
import { toDateInputValue } from "@/lib/format";

export default function ConsortiumForm() {
  const [state, formAction, pending] = useActionState(
    createConsortiumAction,
    {} as ConsorcioFormState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome / identificação" required>
        <Input name="name" required placeholder="Ex: Consórcio caminhão guincho" />
      </Field>
      <Field label="Administradora">
        <Input name="administrator" placeholder="Ex: Embracon" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Carta de crédito (R$)" required>
          <Input name="creditValue" type="number" step="0.01" min={0.01} required />
        </Field>
        <Field label="Parcela mensal (R$)" required>
          <Input name="installmentValue" type="number" step="0.01" min={0.01} required />
        </Field>
        <Field label="Nº de parcelas" required>
          <Input name="installmentsCount" type="number" min={1} max={240} required />
        </Field>
        <Field label="Dia do vencimento" required>
          <Input name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
        </Field>
      </div>
      <Field label="Primeira parcela em" required>
        <Input name="startDate" type="date" defaultValue={toDateInputValue(new Date())} required />
      </Field>
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar consórcio"}
      </Button>
    </form>
  );
}
