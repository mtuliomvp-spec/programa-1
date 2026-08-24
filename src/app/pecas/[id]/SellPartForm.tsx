"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { sellPartAction, type FormState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type Customer = { id: string; name: string };
type Account = { id: string; name: string };

export default function SellPartForm({
  partId,
  currentSalePrice,
  availableQuantity,
  customers,
  accounts,
}: {
  partId: string;
  currentSalePrice: number;
  availableQuantity: number;
  customers: Customer[];
  accounts: Account[];
}) {
  const [state, formAction, pending] = useActionState(sellPartAction, {} as FormState);
  const [paymentMethod, setPaymentMethod] = useState<"A_VISTA" | "PARCELADO">("A_VISTA");

  if (availableQuantity <= 0) {
    return <p className="text-sm text-slate-500">Sem estoque disponível para venda.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="partId" defaultValue={partId} />
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantidade" required>
          <Input type="number" min={1} max={availableQuantity} name="quantity" required defaultValue={1} />
        </Field>
        <Field label="Preço unitário" required>
          <Input type="number" step="0.01" min={0} name="unitPrice" required defaultValue={currentSalePrice} />
        </Field>
      </div>
      <p className="text-xs text-slate-500">Disponível em estoque: {availableQuantity} un.</p>
      <Field label="Cliente (opcional)">
        <Select name="customerId" defaultValue="">
          <option value="">Venda avulsa / balcão</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Data da venda" required>
        <Input type="date" name="saleDate" defaultValue={toDateInputValue(new Date())} required />
      </Field>
      <Field label="Forma de pagamento" required>
        <Select name="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
          <option value="A_VISTA">À vista</option>
          <option value="PARCELADO">Parcelado</option>
        </Select>
      </Field>
      {paymentMethod === "PARCELADO" ? (
        <>
          <Field label="Número de parcelas" required>
            <Input type="number" min={2} name="installmentsCount" defaultValue={2} required />
          </Field>
          <p className="text-xs text-slate-500">
            A conta de destino é escolhida na baixa de cada parcela, quando o dinheiro entra.
          </p>
        </>
      ) : (
        <Field label="Conta em que o dinheiro entrou" required>
          <Select name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando..." : "Registrar venda"}
      </Button>
    </form>
  );
}
