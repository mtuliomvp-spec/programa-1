"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { addCapitalTransactionAction, type CapitalFormState } from "../actions";
import { toDateInputValue } from "@/lib/format";

export default function CapitalTransactionForm({ beneficiaryId }: { beneficiaryId: string }) {
  const [state, formAction, pending] = useActionState(
    addCapitalTransactionAction,
    {} as CapitalFormState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Tipo" required>
        <Select name="kind" defaultValue="APORTE">
          <option value="APORTE">Aporte (dinheiro entra na loja)</option>
          <option value="RETIRADA">Retirada (dinheiro sai da loja)</option>
          <option value="PRO_LABORE">Pró-labore (remuneração mensal)</option>
        </Select>
      </Field>
      <Field label="Valor (R$)" required>
        <Input name="amount" type="number" step="0.01" min={0.01} required />
      </Field>
      <Field label="Data" required>
        <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
      </Field>
      <Field label="Descrição (opcional)">
        <Input name="description" placeholder="Ex: aporte para compra de estoque" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando..." : "Registrar movimentação"}
      </Button>
    </form>
  );
}
