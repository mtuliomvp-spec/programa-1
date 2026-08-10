"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { saveFuelPricesAction } from "./actions";

export const FUEL_TYPES = ["Gasolina", "Etanol", "Diesel", "GNV"] as const;

/** Preços por litro pré-determinados: o form de abastecimento usa para calcular
 *  os litros a partir do VALOR digitado. */
export default function FuelPricesCard({ prices }: { prices: Record<string, number> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FUEL_TYPES.map((f) => [f, prices[f] ? String(prices[f]) : ""])),
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveFuelPricesAction(
        FUEL_TYPES.map((f) => ({ fuelType: f, pricePerLiter: Number(values[f]?.replace(",", ".") || 0) })),
      );
      setMsg(r.ok ? "Preços salvos." : r.error || "Não foi possível salvar.");
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FUEL_TYPES.map((f) => (
          <Field key={f} label={`${f} (R$/L)`}>
            <Input
              inputMode="decimal"
              value={values[f] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              placeholder="0,000"
            />
          </Field>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Salvando..." : "Salvar preços"}
        </Button>
        {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
      </div>
    </div>
  );
}
