"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createFuelEntryAction, type FuelFormState } from "./actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";

type VehicleOption = { id: string; brand: string; model: string; plate: string; fuel: string | null };

/** Combustível da ficha do veículo → tipo do abastecimento (Flex → Gasolina por padrão). */
function fuelTypeOf(vehicleFuel: string | null | undefined): string {
  const f = (vehicleFuel || "").toLowerCase();
  if (f.includes("gasolina") || f.includes("flex")) return "Gasolina";
  if (f.includes("etanol") || f.includes("álcool") || f.includes("alcool")) return "Etanol";
  if (f.includes("diesel")) return "Diesel";
  if (f.includes("gnv") || f.includes("gás") || f.includes("gas")) return "GNV";
  return "";
}

/**
 * Nova dinâmica: o operador digita o VALOR abastecido; o preço por litro vem
 * pré-determinado (tela de preços) conforme o combustível do veículo escolhido;
 * o sistema calcula os litros (valor ÷ preço).
 */
export default function FuelForm({
  vehicles,
  prices,
}: {
  vehicles: VehicleOption[];
  prices: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState(createFuelEntryAction, {} as FuelFormState);
  const [fuelType, setFuelType] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");

  function onVehicleChange(vehicleId: string) {
    const v = vehicles.find((x) => x.id === vehicleId);
    const ft = fuelTypeOf(v?.fuel);
    if (ft) applyFuelType(ft);
  }

  function applyFuelType(ft: string) {
    setFuelType(ft);
    const p = prices[ft];
    if (p) setPrice(String(p));
  }

  const amountNum = Number(amount.replace(",", "."));
  const priceNum = Number(price.replace(",", "."));
  const liters =
    Number.isFinite(amountNum) && amountNum > 0 && Number.isFinite(priceNum) && priceNum > 0
      ? Math.round((amountNum / priceNum) * 1000) / 1000
      : 0;

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Data" required>
        <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
      </Field>
      <Field label="Veículo do estoque (opcional)">
        <Select name="vehicleId" defaultValue="" onChange={(e) => onVehicleChange(e.target.value)}>
          <option value="">Outro veículo (informe a placa)</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.brand} {v.model} · {v.plate}
              {v.fuel ? ` (${v.fuel})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Placa (se não for do estoque)">
        <Input name="plate" placeholder="ABC1D23" className="uppercase" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Combustível">
          <Select name="fuelType" value={fuelType} onChange={(e) => applyFuelType(e.target.value)}>
            <option value="">Selecione</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Etanol">Etanol</option>
            <option value="Diesel">Diesel</option>
            <option value="GNV">GNV</option>
          </Select>
        </Field>
        <Field label="Preço por litro" required>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Preço pré-determinado"
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor abastecido (R$)" required>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex: 100,00"
            required
          />
        </Field>
        <Field label="Litros (calculado)">
          <Input value={liters > 0 ? String(liters).replace(".", ",") : ""} readOnly className="bg-slate-50" placeholder="—" />
        </Field>
      </div>
      {/* Números normalizados (vírgula→ponto) seguem para a ação por campos ocultos. */}
      <input type="hidden" name="liters" value={liters > 0 ? liters : ""} />
      <input type="hidden" name="pricePerLiter" value={Number.isFinite(priceNum) && priceNum > 0 ? priceNum : ""} />
      <input type="hidden" name="total" value={Number.isFinite(amountNum) && amountNum > 0 ? amountNum : ""} />
      {liters > 0 ? (
        <p className="text-xs text-slate-500">
          {formatCurrency(amountNum)} ÷ {price.replace(".", ",")} = <strong>{String(liters).replace(".", ",")} L</strong>
        </p>
      ) : null}
      <Field label="KM atual">
        <Input name="km" type="number" min={0} />
      </Field>
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
      <Button type="submit" disabled={pending || liters <= 0} className="w-full">
        {pending ? "Registrando..." : "Registrar abastecimento"}
      </Button>
    </form>
  );
}
