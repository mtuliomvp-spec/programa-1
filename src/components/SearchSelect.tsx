"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { nameKey } from "@/lib/person-keys";

type Option = { id: string; label: string };

/**
 * Seletor com BUSCA que envia o ID: digite para filtrar, clique para escolher.
 *
 * Existe porque o <Select> nativo vira uma lista quilométrica conforme o
 * cadastro cresce (o de clientes foi o primeiro a doer). O SupplierInput já
 * fazia busca, mas envia o TEXTO digitado — aqui o formulário precisa do id,
 * então a escolha é obrigatoriamente um item da lista: texto digitado sem
 * escolha não seleciona ninguém.
 *
 * A busca ignora acento/maiúscula/pontuação (nameKey): "jose" acha "José".
 */
export default function SearchSelect({
  name,
  options,
  value,
  onChange,
  placeholder = "Digite para buscar...",
  emptyLabel = "Nenhum",
  required = false,
}: {
  name: string;
  options: Option[];
  /** Id selecionado ("" = nenhum). Controlado pelo pai. */
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
}) {
  const selected = options.find((o) => o.id === value) ?? null;
  // Texto do campo: null = mostrando o rótulo da seleção; string = buscando.
  const [busca, setBusca] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const texto = busca !== null ? busca : (selected?.label ?? "");
  const q = nameKey(busca ?? "");
  const matches = (q ? options.filter((o) => nameKey(o.label).includes(q)) : options).slice(0, 40);

  const escolher = (id: string) => {
    onChange(id);
    setBusca(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* O formulário envia o ID — nunca o texto da busca. */}
      <input type="hidden" name={name} value={value} required={required} />
      <Input
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setBusca(e.target.value);
          setOpen(true);
          // Editar o texto desfaz a seleção: o que vale é escolher da lista.
          if (value) onChange("");
        }}
        onFocus={(e) => {
          setOpen(true);
          // Facilita trocar: foco com seleção feita já deixa tudo marcado.
          if (selected) e.currentTarget.select();
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            // Saiu sem escolher: volta a mostrar a seleção atual (ou vazio).
            setBusca(null);
          }, 150)
        }
      />
      {selected ? (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            escolher("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          title="Limpar"
          aria-label="Limpar seleção"
        >
          ✕
        </button>
      ) : null}
      {open ? (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
          {!required ? (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher("");
                }}
                className="block w-full px-3 py-2 text-left text-slate-400 hover:bg-blue-50"
              >
                {emptyLabel}
              </button>
            </li>
          ) : null}
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(o.id);
                }}
                className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${
                  o.id === value ? "font-medium text-blue-700" : "text-slate-700"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-slate-400">Nada encontrado para “{texto}”.</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
