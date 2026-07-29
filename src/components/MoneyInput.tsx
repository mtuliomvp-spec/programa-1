"use client";

import { useState } from "react";
import { Input } from "@/components/ui";

/**
 * Campo de valor em Real com máscara automática: o usuário digita só os números
 * e o campo já mostra com ponto (milhar) e vírgula (centavos) — ex.: digitar
 * "10790" vira "107,90". Um input oculto envia o número com ponto decimal
 * ("107.90"), compatível com `z.coerce.number()` no servidor.
 */
const brFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function format(value: number): string {
  return brFormat.format(value);
}

export default function MoneyInput({
  name,
  defaultValue,
  required = false,
  placeholder = "0,00",
}: {
  name: string;
  defaultValue?: number | null;
  required?: boolean;
  placeholder?: string;
}) {
  const seed =
    defaultValue != null && Number.isFinite(defaultValue) && defaultValue > 0 ? defaultValue : null;
  const [display, setDisplay] = useState(seed != null ? format(seed) : "");
  const [raw, setRaw] = useState(seed != null ? seed.toFixed(2) : "");

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      setDisplay("");
      setRaw("");
      return;
    }
    const value = parseInt(digits, 10) / 100;
    setDisplay(format(value));
    setRaw(value.toFixed(2));
  }

  return (
    <>
      <Input
        inputMode="decimal"
        value={display}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
      <input type="hidden" name={name} value={raw} />
    </>
  );
}
