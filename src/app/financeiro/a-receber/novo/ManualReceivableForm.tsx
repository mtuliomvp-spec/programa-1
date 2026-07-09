"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createManualReceivableAction, type ManualReceivableState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type Customer = { id: string; name: string };

export default function ManualReceivableForm({ customers }: { customers: Customer[] }) {
  const [state, formAction, pending] = useActionState(createManualReceivableAction, {} as ManualReceivableState);
  const [alreadyReceived, setAlreadyReceived] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <Field label="Descrição" required>
        <Input name="description" required placeholder="Ex: Devolução / reembolso de fornecedor" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Cliente">
          <Select name="customerId" defaultValue="">
            <option value="">Sem cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor" required>
          <Input type="number" step="0.01" min={0.01} name="amount" required />
        </Field>
        <Field label="Vencimento" required>
          <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} required />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="alreadyReceived"
          value="true"
          checked={alreadyReceived}
          onChange={(e) => setAlreadyReceived(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Já foi recebido
      </label>
      <Field label="Observações">
        <Textarea name="notes" rows={3} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Lançar conta"}
        </Button>
      </div>
    </form>
  );
}
