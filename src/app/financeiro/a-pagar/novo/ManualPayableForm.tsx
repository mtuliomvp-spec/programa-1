"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createManualPayableAction, type ManualPayableState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type Supplier = { id: string; name: string };
type CostCenter = { id: string; name: string };

export default function ManualPayableForm({
  suppliers,
  costCenters,
}: {
  suppliers: Supplier[];
  costCenters: CostCenter[];
}) {
  const [state, formAction, pending] = useActionState(createManualPayableAction, {} as ManualPayableState);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <Field label="Descrição" required>
        <Input name="description" required placeholder="Ex: Aluguel do salão de vendas" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Categoria" required>
          <Select name="category" defaultValue="DESPESA_OPERACIONAL">
            <option value="DESPESA_OPERACIONAL">Despesa operacional</option>
            <option value="COMISSAO">Comissão</option>
            <option value="SALARIO">Salário</option>
            <option value="COMBUSTIVEL">Combustível</option>
            <option value="OUTROS">Outros</option>
          </Select>
        </Field>
        <Field label="Fornecedor">
          <Select name="supplierId" defaultValue="">
            <option value="">Sem fornecedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
        <Field label="Centro de custo (obra, imóvel...)">
          <Select name="costCenterId" defaultValue="">
            <option value="">Nenhum (loja)</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="alreadyPaid"
          value="true"
          checked={alreadyPaid}
          onChange={(e) => setAlreadyPaid(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Já foi pago
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
