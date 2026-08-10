"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { searchTitlesAction, type BankTxn, type MatchCandidate } from "./actions";

/**
 * Painel para conferir e ESCOLHER os títulos de uma linha do extrato. Aceita
 * mais de um título na mesma linha (um Pix que pagou duas contas), e só libera
 * a confirmação quando a soma fecha exatamente com o valor do banco.
 */
export default function MatchPicker({
  txn,
  initial,
  onClose,
  onConfirm,
}: {
  txn: BankTxn;
  initial: MatchCandidate[];
  onClose: () => void;
  onConfirm: (items: MatchCandidate[]) => void;
}) {
  const kind: "payable" | "receivable" = txn.amount < 0 ? "payable" : "receivable";
  const target = Math.abs(txn.amount);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MatchCandidate[]>([]);
  const [chosen, setChosen] = useState<MatchCandidate[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  function load(q: string) {
    startLoad(async () => {
      const res = await searchTitlesAction({ kind, date: txn.date, query: q });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items ?? []);
    });
  }

  useEffect(() => {
    load("");
    // Carrega uma vez ao abrir; a busca refaz sob demanda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosenIds = new Set(chosen.map((c) => c.id));
  // Os escolhidos aparecem sempre no topo, mesmo fora do resultado da busca.
  const list = [...chosen, ...items.filter((i) => !chosenIds.has(i.id))];

  const sum = chosen.reduce((s, c) => s + c.amount, 0);
  const diff = Math.round((target - sum) * 100) / 100;
  const exact = Math.abs(diff) <= 0.01;

  function toggle(item: MatchCandidate) {
    setChosen((prev) =>
      prev.some((c) => c.id === item.id) ? prev.filter((c) => c.id !== item.id) : [...prev, item],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Linha do extrato</p>
          <p className="text-sm font-medium text-slate-900">{txn.memo}</p>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(txn.date)} ·{" "}
            <span className={txn.amount < 0 ? "text-rose-600" : "text-emerald-600"}>
              {formatCurrency(txn.amount)}
            </span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Marque {kind === "payable" ? "a conta paga" : "o recebimento"} que corresponde a esta
            linha. Se o banco juntou mais de um título, marque todos — a soma tem de fechar exata.
          </p>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                load(query);
              }
            }}
            placeholder="Buscar por descrição, fornecedor/cliente ou documento"
            className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900"
          />
          <Button type="button" variant="secondary" onClick={() => load(query)} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? <p className="px-5 py-4 text-sm text-rose-600">{error}</p> : null}
          {!error && list.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              {loading ? "Carregando..." : "Nenhum título encontrado nesse período. Tente buscar pelo nome."}
            </p>
          ) : null}
          <ul className="divide-y divide-slate-100">
            {list.map((item) => {
              const on = chosenIds.has(item.id);
              return (
                <li key={item.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 px-5 py-3 text-sm ${
                      on ? "bg-blue-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(item)}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{item.description}</span>
                      <span className="block text-xs text-slate-500">
                        Vence {formatDate(item.date)}
                        {item.who ? ` · ${item.who}` : ""}
                        {item.settled ? " · já baixado" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-700">
                      {formatCurrency(item.amount)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <p className="text-sm text-slate-600">
            Selecionado <strong className="tabular-nums">{formatCurrency(sum)}</strong> de{" "}
            <strong className="tabular-nums">{formatCurrency(target)}</strong>
            {exact ? (
              <span className="ml-2 font-medium text-emerald-600">✓ fecha exato</span>
            ) : (
              <span className="ml-2 font-medium text-amber-600">
                {diff > 0 ? `faltam ${formatCurrency(diff)}` : `sobram ${formatCurrency(-diff)}`}
              </span>
            )}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!exact || chosen.length === 0}
              onClick={() => onConfirm(chosen)}
            >
              Usar {chosen.length === 1 ? "este título" : `estes ${chosen.length} títulos`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
