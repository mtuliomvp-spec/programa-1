"use client";

import { useState, type KeyboardEvent } from "react";
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
 *
 * Serve nos dois modos: CONTROLADO pelo pai (`value` + `onChange`, quando o
 * formulário reage à escolha) ou SOZINHO (`defaultValue`), que é o caso das
 * barras de filtro — elas são renderizadas no servidor e só precisam do id no
 * form GET.
 */
export default function SearchSelect({
  name,
  options,
  value: valueProp,
  onChange,
  defaultValue = "",
  placeholder = "Digite para buscar...",
  emptyLabel = "Nenhum",
  required = false,
  className = "",
}: {
  name: string;
  options: Option[];
  /** Id selecionado ("" = nenhum). Só no modo controlado. */
  value?: string;
  onChange?: (id: string) => void;
  /** Escolha inicial no modo sozinho (sem `value`/`onChange`). */
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  /** Largura/espaçamento do campo, como nos selects que ele substitui. */
  className?: string;
}) {
  const [interno, setInterno] = useState(defaultValue);
  // Item destacado pelas setas (0 = a linha "nenhum/todos", quando existe).
  const [marcado, setMarcado] = useState(0);
  const value = valueProp !== undefined ? valueProp : interno;
  const setValue = (id: string) => (onChange ? onChange(id) : setInterno(id));
  const selected = options.find((o) => o.id === value) ?? null;
  // Texto do campo: null = mostrando o rótulo da seleção; string = buscando.
  const [busca, setBusca] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const texto = busca !== null ? busca : (selected?.label ?? "");
  const q = nameKey(busca ?? "");
  const matches = (q ? options.filter((o) => nameKey(o.label).includes(q)) : options).slice(0, 40);

  const escolher = (id: string) => {
    setValue(id);
    setBusca(null);
    setOpen(false);
    setMarcado(0);
  };

  /**
   * Setas e Enter: quem digita para buscar não quer tirar a mão do teclado
   * para clicar. A linha "nenhum/todos" entra na conta como índice 0.
   */
  const temVazio = !required;
  const linhas = temVazio ? matches.length + 1 : matches.length;
  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!linhas) return;
      setMarcado((m) => (m + (e.key === "ArrowDown" ? 1 : -1) + linhas) % linhas);
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (temVazio && marcado === 0) return escolher("");
      const alvo = matches[temVazio ? marcado - 1 : marcado];
      if (alvo) escolher(alvo.id);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setBusca(null);
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* O formulário envia o ID — nunca o texto da busca. */}
      <input type="hidden" name={name} value={value} required={required} />
      <Input
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        onKeyDown={teclado}
        onChange={(e) => {
          setBusca(e.target.value);
          setOpen(true);
          setMarcado(0);
          // Editar o texto desfaz a seleção: o que vale é escolher da lista.
          if (value) setValue("");
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
                onMouseEnter={() => setMarcado(0)}
                className={`block w-full px-3 py-2 text-left text-slate-400 hover:bg-blue-50 ${
                  marcado === 0 ? "bg-blue-50" : ""
                }`}
              >
                {emptyLabel}
              </button>
            </li>
          ) : null}
          {matches.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(o.id);
                }}
                onMouseEnter={() => setMarcado(temVazio ? i + 1 : i)}
                className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${
                  o.id === value ? "font-medium text-blue-700" : "text-slate-700"
                } ${marcado === (temVazio ? i + 1 : i) ? "bg-blue-50" : ""}`}
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
