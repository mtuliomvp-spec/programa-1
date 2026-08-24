"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import { createPartAction, type FormState } from "./actions";
import { toDateInputValue } from "@/lib/format";

type Supplier = { id: string; name: string };
type Account = { id: string; name: string };

export default function PartForm({
  suppliers,
  accounts,
}: {
  suppliers: Supplier[];
  accounts: Account[];
}) {
  const [state, formAction, pending] = useActionState(createPartAction, {} as FormState);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Código" required>
          <Input name="code" required placeholder="Ex: FLT-001" />
        </Field>
        <Field label="Nome" required>
          <Input name="name" required placeholder="Ex: Filtro de óleo" />
        </Field>
        <Field label="Quantidade inicial">
          <Input type="number" min={0} name="quantity" defaultValue={0} />
        </Field>
        <Field label="Estoque mínimo">
          <Input type="number" min={0} name="minQuantity" defaultValue={0} />
        </Field>
        <Field label="Preço de custo (unitário)" required>
          <Input type="number" step="0.01" min={0} name="costPrice" required />
        </Field>
        <Field label="Preço de venda (unitário)" required>
          <Input type="number" step="0.01" min={0} name="salePrice" required />
        </Field>
        <SupplierSelect suppliers={suppliers} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Financeiro da compra inicial</p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="alreadyPaid"
            value="true"
            checked={alreadyPaid}
            onChange={(e) => setAlreadyPaid(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Compra já foi paga ao fornecedor
        </label>
        {alreadyPaid ? (
          <div className="mt-3 max-w-xs">
            <Field label="Conta de onde saiu o pagamento" required>
              <Select name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="mt-3 max-w-xs">
            <Field label="Vencimento do pagamento">
              <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} />
            </Field>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Se houver quantidade inicial com custo, uma conta a pagar é gerada automaticamente.
        </p>
      </div>

      <Field label="Descrição">
        <Textarea name="description" rows={2} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Cadastrar peça"}
        </Button>
      </div>
    </form>
  );
}
