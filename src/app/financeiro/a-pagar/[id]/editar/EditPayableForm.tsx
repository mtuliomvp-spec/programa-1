"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import MoneyInput from "@/components/MoneyInput";
import { toDateInputValue } from "@/lib/format";
import { updatePayableAction, type EditPayableState } from "../../actions";

type Supplier = { id: string; name: string };
type Payable = {
  id: string;
  description: string;
  categoryLabel: string;
  documentNumber: string | null;
  amount: number;
  dueDate: string;
  supplierId: string | null;
  notes: string | null;
};

export default function EditPayableForm({
  payable,
  suppliers,
}: {
  payable: Payable;
  suppliers: Supplier[];
}) {
  const [state, formAction, pending] = useActionState(updatePayableAction, {} as EditPayableState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={payable.id} />
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <Field label="Descrição" required>
        <Input name="description" required defaultValue={payable.description} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Categoria" required>
          <Input name="categoryLabel" required defaultValue={payable.categoryLabel} placeholder="Ex: Parcela Financiamento" />
        </Field>
        <Field label="Nº da NF / documento">
          <Input name="documentNumber" defaultValue={payable.documentNumber || ""} placeholder="Ex: NF 12345" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)" required>
          <MoneyInput name="amount" defaultValue={payable.amount} required />
        </Field>
        <Field label="Vencimento" required>
          <Input name="dueDate" type="date" required defaultValue={toDateInputValue(new Date(payable.dueDate))} />
        </Field>
      </div>

      <SupplierSelect
        suppliers={suppliers}
        label="Fornecedor"
        emptyLabel="Sem fornecedor"
        defaultValue={payable.supplierId || ""}
      />

      <Field label="Observações">
        <Textarea name="notes" rows={2} defaultValue={payable.notes || ""} />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
