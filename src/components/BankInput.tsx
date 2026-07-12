"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { BANKS } from "@/lib/banks";

/**
 * Campo de banco/instituição com lista VISÍVEL de sugestões (combobox): ao
 * focar ou digitar, abre uma lista rolável abaixo do campo com os bancos do
 * Sistema Financeiro Nacional. Dá para tocar numa opção ou digitar outra.
 */
export default function BankInput({
  name,
  defaultValue = "",
  placeholder,
  className,
  required,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const q = value.trim().toLowerCase();
  const matches = (q ? BANKS.filter((b) => b.toLowerCase().includes(q)) : BANKS).slice(0, 60);

  return (
    <div className="relative">
      <Input
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
          {matches.map((b) => (
            <li key={b}>
              <button
                type="button"
                // onMouseDown (antes do blur) garante que a seleção registra
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(b);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50"
              >
                {b}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
