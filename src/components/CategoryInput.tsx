"use client";

import { useState } from "react";
import { Input } from "@/components/ui";

/**
 * Campo de categoria com sugestões e digitação livre: mostra as categorias já
 * cadastradas (padrão + as criadas pelo usuário) e permite digitar uma nova.
 * A categoria digitada é cadastrada automaticamente ao salvar o lançamento.
 */
export default function CategoryInput({
  name,
  options,
  defaultValue = "",
  placeholder = "Ex.: Revisão, Documentação...",
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const q = value.trim().toLowerCase();
  const matches = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 40);

  return (
    <div className="relative">
      <Input
        name={name}
        value={value}
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
            <li key={o}>
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
