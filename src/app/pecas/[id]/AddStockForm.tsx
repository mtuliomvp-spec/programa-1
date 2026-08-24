"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import { addStockAction, type FormState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type Supplier = { id: string; name: string };
type Account = { id: string; name: string };

export default function AddStockForm({
  partId,
  currentCostPrice,
  supplierId,
  suppliers,
  accounts,
}: {
  partId: string;
  currentCostPrice: number;
  supplierId: string | null;
  suppliers: Supplier[];
  accounts: Account[];
}) {
  const [state, formAction, pending] = useActionState(addStockAction, {} as FormState);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="partId" defaultValue={partId} />
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantidade" required>
          <Input type="number" min={1} name="quantity" required defaultValue={1} />
        </Field>
        <Field label="Custo unitário" required>
          <Input type="number" step="0.01" min={0} name="costPrice" required defaultValue={currentCostPrice} />
        </Field>
      </div>
      <SupplierSelect suppliers={suppliers} defaultValue={supplierId || ""} />
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="alreadyPaid"
          value="true"
          checked={alreadyPaid}
          onChange={(e) => setAlreadyPaid(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Já foi pago ao fornecedor
      </label>
      {alreadyPaid ? (
        <Field label="Conta de onde saiu o pagamento" required>
          <Select name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Vencimento">
          <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} />
        </Field>
      )}
      <p className="text-xs text-slate-500">
        O custo da peça passa a ser a média entre o estoque atual e esta entrada.
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando..." : "Registrar entrada"}
      </Button>
    </form>
  );
}
