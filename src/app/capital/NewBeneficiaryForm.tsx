"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { createBeneficiaryAction, type CapitalFormState } from "./actions";

export default function NewBeneficiaryForm() {
  const [state, formAction, pending] = useActionState(
    createBeneficiaryAction,
    {} as CapitalFormState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome" required>
        <Input name="name" required placeholder="Ex: Marcelo (sócio)" />
      </Field>
      <Field label="Pró-labore mensal (R$, opcional)">
        <Input name="proLabore" type="number" step="0.01" min={0} defaultValue={0} />
      </Field>
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar beneficiário"}
      </Button>
    </form>
  );
}
