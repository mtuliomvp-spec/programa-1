"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createTransferAction, type ContaFormState } from "./actions";

type Option = { id: string; name: string };

export default function TransferForm({
  accounts,
  cashboxDate = null,
}: {
  accounts: Option[];
  cashboxDate?: string | null;
}) {
  const [state, formAction, pending] = useActionState(createTransferAction, {} as ContaFormState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="De (origem)" required>
        <Select name="fromId" defaultValue={accounts[0]?.id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Para (destino)" required>
        <Select name="toId" defaultValue={accounts[1]?.id}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Valor (R$)" required>
        <Input name="amount" type="number" step="0.01" min={0.01} required />
      </Field>
      <p className="text-xs text-slate-500">
        Data da transferência: <strong>{cashboxDate ? `${cashboxDate} (data do caixa)` : "data do caixa aberto"}</strong>
      </p>
      <Field label="Descrição">
        <Input name="description" placeholder="Ex: depósito do caixa no banco" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Transferindo..." : "Registrar transferência"}
      </Button>
    </form>
  );
}
