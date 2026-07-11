"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createFuelEntryAction, type FuelFormState } from "./actions";
import { toDateInputValue } from "@/lib/format";

type VehicleOption = { id: string; brand: string; model: string; plate: string };

export default function FuelForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const [state, formAction, pending] = useActionState(createFuelEntryAction, {} as FuelFormState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Data" required>
        <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
      </Field>
      <Field label="Veículo do estoque (opcional)">
        <Select name="vehicleId" defaultValue="">
          <option value="">Outro veículo (informe a placa)</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.brand} {v.model} · {v.plate}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Placa (se não for do estoque)">
        <Input name="plate" placeholder="ABC1D23" className="uppercase" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Litros" required>
          <Input name="liters" type="number" step="0.01" min={0.01} required />
        </Field>
        <Field label="Preço por litro" required>
          <Input name="pricePerLiter" type="number" step="0.001" min={0.01} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Combustível">
          <Select name="fuelType" defaultValue="">
            <option value="">Selecione</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Etanol">Etanol</option>
            <option value="Diesel">Diesel</option>
            <option value="GNV">GNV</option>
          </Select>
        </Field>
        <Field label="KM atual">
          <Input name="km" type="number" min={0} />
        </Field>
      </div>
      <Field label="Motorista">
        <Input name="driver" placeholder="Quem abasteceu" />
      </Field>
      <Field label="Posto">
        <Input name="station" placeholder="Nome do posto" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="alreadyPaid" value="true" className="h-4 w-4 rounded border-slate-300" />
        Já paguei no ato (senão, entra como conta a pagar)
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Registrando..." : "Registrar abastecimento"}
      </Button>
    </form>
  );
}
