"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import { createPartAction, type FormState } from "./actions";
import { toDateInputValue } from "@/lib/format";

type Supplier = { id: string; name: string };

export default function PartForm({ suppliers }: { suppliers: Supplier[] }) {
  const [state, formAction, pending] = useActionState(createPartAction, {} as FormState);

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
        <div className="max-w-xs">
          <Field label="Vencimento do pagamento">
            <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Havendo quantidade inicial com custo, a <strong>conta a pagar é gerada aqui</strong> e o
          pagamento é feito pelo financeiro (Contas a pagar ou Livro caixa), indicando a conta de
          onde o dinheiro saiu — é assim que o valor entra no fluxo Peças.
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
