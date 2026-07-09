"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createVehicleAction, updateVehicleAction, type VehicleFormState } from "./actions";
import { toDateInputValue } from "@/lib/format";

type Supplier = { id: string; name: string };

type VehicleData = {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  manufactureYear: number;
  modelYear: number;
  plate: string;
  chassi: string | null;
  color: string | null;
  km: number;
  fuel: string | null;
  transmission: string | null;
  purchasePrice: number;
  salePrice: number;
  entryDate: Date;
  notes: string | null;
  supplierId: string | null;
};

const initialState: VehicleFormState = {};

export default function VehicleForm({
  suppliers,
  vehicle,
}: {
  suppliers: Supplier[];
  vehicle?: VehicleData;
}) {
  const isEdit = Boolean(vehicle);
  const action = isEdit ? updateVehicleAction : createVehicleAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [alreadyPaid, setAlreadyPaid] = useState(true);

  return (
    <form action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" defaultValue={vehicle!.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Marca" required>
          <Input name="brand" defaultValue={vehicle?.brand} required placeholder="Ex: Volkswagen" />
        </Field>
        <Field label="Modelo" required>
          <Input name="model" defaultValue={vehicle?.model} required placeholder="Ex: Gol" />
        </Field>
        <Field label="Versão">
          <Input name="version" defaultValue={vehicle?.version || ""} placeholder="Ex: 1.6 MSI" />
        </Field>
        <Field label="Ano fabricação" required>
          <Input type="number" name="manufactureYear" defaultValue={vehicle?.manufactureYear ?? new Date().getFullYear()} required />
        </Field>
        <Field label="Ano modelo" required>
          <Input type="number" name="modelYear" defaultValue={vehicle?.modelYear ?? new Date().getFullYear()} required />
        </Field>
        <Field label="Placa" required>
          <Input name="plate" defaultValue={vehicle?.plate} required placeholder="ABC1D23" className="uppercase" />
        </Field>
        <Field label="Chassi (VIN)">
          <Input name="chassi" defaultValue={vehicle?.chassi || ""} />
        </Field>
        <Field label="Cor">
          <Input name="color" defaultValue={vehicle?.color || ""} />
        </Field>
        <Field label="Quilometragem">
          <Input type="number" name="km" defaultValue={vehicle?.km ?? 0} min={0} />
        </Field>
        <Field label="Combustível">
          <Select name="fuel" defaultValue={vehicle?.fuel || ""}>
            <option value="">Selecione</option>
            <option value="Flex">Flex</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Diesel">Diesel</option>
            <option value="Híbrido">Híbrido</option>
            <option value="Elétrico">Elétrico</option>
          </Select>
        </Field>
        <Field label="Câmbio">
          <Select name="transmission" defaultValue={vehicle?.transmission || ""}>
            <option value="">Selecione</option>
            <option value="Manual">Manual</option>
            <option value="Automático">Automático</option>
            <option value="CVT">CVT</option>
          </Select>
        </Field>
        <Field label="Data de entrada" required>
          <Input
            type="date"
            name="entryDate"
            defaultValue={vehicle ? toDateInputValue(vehicle.entryDate) : toDateInputValue(new Date())}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Preço de compra (custo)" required>
          <Input type="number" step="0.01" min={0} name="purchasePrice" defaultValue={vehicle?.purchasePrice} required />
        </Field>
        <Field label="Preço de venda (anúncio)" required>
          <Input type="number" step="0.01" min={0} name="salePrice" defaultValue={vehicle?.salePrice} required />
        </Field>
        <Field label="Fornecedor de origem">
          <Select name="supplierId" defaultValue={vehicle?.supplierId || ""}>
            <option value="">Sem fornecedor / particular</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!isEdit ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Financeiro da compra</p>
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
          {!alreadyPaid ? (
            <div className="mt-3 max-w-xs">
              <Field label="Vencimento do pagamento">
                <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} />
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Será lançada automaticamente uma conta a pagar para este veículo.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Nenhuma conta a pagar será gerada, pois a compra já está quitada.
            </p>
          )}
        </div>
      ) : null}

      <Field label="Observações">
        <Textarea name="notes" defaultValue={vehicle?.notes || ""} rows={3} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar veículo"}
        </Button>
      </div>
    </form>
  );
}
