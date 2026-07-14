"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { receiveVehicleAdvanceAction, deleteVehicleAdvanceAction, type AdvanceFormState } from "../actions";

type Account = { id: string; name: string };
type Customer = { id: string; name: string };
type Advance = { id: string; amount: number; date: Date; accountName: string | null; customerName: string | null };

export default function VehicleAdvance({
  vehicleId,
  accounts,
  customers,
  advances,
}: {
  vehicleId: string;
  accounts: Account[];
  customers: Customer[];
  advances: Advance[];
}) {
  const [state, formAction, pending] = useActionState<AdvanceFormState, FormData>(
    async (prev, formData) => {
      const result = await receiveVehicleAdvanceAction(prev, formData);
      if (result.success) setShow(false);
      return result;
    },
    {},
  );
  const [show, setShow] = useState(false);
  const [deleting, startDelete] = useTransition();
  const total = advances.reduce((s, a) => s + a.amount, 0);

  return (
    <div>
      {advances.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {advances.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{formatCurrency(a.amount)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {formatDate(a.date)}
                  {a.accountName ? <Badge tone="success">{a.accountName}</Badge> : null}
                  {a.customerName ? <span>· {a.customerName}</span> : null}
                </p>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  if (confirm("Excluir este sinal? O valor recebido será estornado da conta.")) {
                    startDelete(() => deleteVehicleAdvanceAction(a.id, vehicleId));
                  }
                }}
                className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            </li>
          ))}
          <li className="flex items-center justify-between px-5 py-2 text-sm font-semibold text-slate-700">
            <span>Total recebido de sinal</span>
            <span className="text-emerald-700">{formatCurrency(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-500">
          Nenhum sinal recebido. Ao fechar a venda, o sinal é abatido do valor a pagar do cliente.
        </p>
      )}

      <div className="border-t border-slate-100 px-5 py-4">
        {show ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Valor do sinal (R$)" required>
                <Input name="amount" type="number" step="0.01" min="0.01" required />
              </Field>
              <Field label="Data" required>
                <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
              </Field>
              <Field label="Conta que recebeu" required>
                <Select name="accountId" defaultValue={accounts[0]?.id ?? ""}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cliente (opcional)">
                <Select name="customerId" defaultValue="">
                  <option value="">Sem cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || accounts.length === 0}>
                {pending ? "Recebendo..." : "Receber sinal"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShow(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setShow(true)}>
            + Receber sinal / entrada antecipada
          </Button>
        )}
      </div>
    </div>
  );
}
