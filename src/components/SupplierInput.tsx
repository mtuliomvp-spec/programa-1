"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { BANKS } from "@/lib/banks";
import { nameKey } from "@/lib/person-keys";

/**
 * Campo de fornecedor com sugestões e digitação livre: sugere os fornecedores
 * já cadastrados e também os bancos/instituições do sistema financeiro (para
 * lançar tarifas bancárias com o próprio banco como fornecedor). O fornecedor
 * digitado é cadastrado automaticamente ao salvar o lançamento.
 */
export default function SupplierInput({
  name,
  suppliers,
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  required,
  placeholder = "Fornecedor ou banco...",
}: {
  name: string;
  suppliers: string[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlledValue !== undefined ? controlledValue : internal;
  const setValue = (v: string) => (onValueChange ? onValueChange(v) : setInternal(v));
  const [open, setOpen] = useState(false);

  // Fornecedores primeiro, depois os bancos que ainda não são fornecedores.
  // A chave normalizada (sem acento/pontuação) evita a mesma pessoa aparecer
  // duas vezes por diferença de escrita e faz "pmz" achar "PMZ Distribuidora S.A.".
  const seen = new Map<string, string>();
  for (const s of [...suppliers, ...BANKS]) {
    const key = nameKey(s);
    if (key && !seen.has(key)) seen.set(key, s);
  }
  const options = [...seen.values()];

  const q = nameKey(value);
  const matches = (q ? options.filter((o) => nameKey(o).includes(q)) : options).slice(0, 40);

  return (
    <div className="relative">
      <Input
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
          {matches.map((o) => (
            <li key={nameKey(o)}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(o);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
