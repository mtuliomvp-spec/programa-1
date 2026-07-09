"use client";

import { useActionState, useState, useTransition } from "react";
import { addVehicleCostAction, deleteVehicleCostAction, type CostFormState } from "../actions";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { VEHICLE_COST_CATEGORY_LABEL } from "@/lib/labels";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import type { CategoriaCustoVeiculo } from "@prisma/client";

type Cost = {
  id: string;
  description: string;
  category: CategoriaCustoVeiculo;
  amount: number;
  date: Date;
  payableStatus?: "PENDENTE" | "PAGO" | "ATRASADO" | null;
};

export default function VehicleCosts({
  vehicleId,
  costs,
  sold,
}: {
  vehicleId: string;
  costs: Cost[];
  sold: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, pending] = useActionState<CostFormState, FormData>(
    async (prev, formData) => {
      const result = await addVehicleCostAction(prev, formData);
      if (result.success) setShowForm(false);
      return result;
    },
    {},
  );
  const [deleting, startDelete] = useTransition();

  return (
    <div>
      {costs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          Nenhum custo lançado. Registre preparação, documentação, mecânica etc. para
          calcular a margem real do veículo.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {costs.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{c.description}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {formatDate(c.date)}
                  <Badge>{VEHICLE_COST_CATEGORY_LABEL[c.category]}</Badge>
                  {c.payableStatus === "PENDENTE" || c.payableStatus === "ATRASADO" ? (
                    <Badge tone={c.payableStatus === "ATRASADO" ? "danger" : "warning"}>
                      {c.payableStatus === "ATRASADO" ? "Pagamento atrasado" : "A pagar"}
                    </Badge>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-slate-900">
                  {formatCurrency(c.amount)}
                </span>
                {!sold ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      if (confirm("Excluir este custo? A conta a pagar vinculada também será removida.")) {
                        startDelete(() => deleteVehicleCostAction(c.id, vehicleId));
                      }
                    }}
                    className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-100 px-5 py-4">
        {showForm ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Descrição" required>
                <Input name="description" placeholder="Ex.: Troca de pneus" required />
              </Field>
              <Field label="Categoria" required>
                <Select name="category" defaultValue="PREPARACAO">
                  {Object.entries(VEHICLE_COST_CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor (R$)" required>
                <Input name="amount" type="number" step="0.01" min="0.01" required />
              </Field>
              <Field label="Data" required>
                <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="alreadyPaid" value="true" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Já foi pago (senão, entra como conta a pagar pendente)
            </label>
            {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Lançar custo"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : !sold ? (
          <Button type="button" variant="secondary" onClick={() => setShowForm(true)}>
            + Lançar custo
          </Button>
        ) : (
          <p className="text-xs text-slate-400">Veículo vendido — custos congelados para o cálculo do lucro.</p>
        )}
      </div>
    </div>
  );
}
