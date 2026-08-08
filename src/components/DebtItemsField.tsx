"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { VehicleDebtItem } from "@/lib/vehicle-debts";

type DebtRow = { description: string; amount: string; dueDate: string };

/**
 * Detalhamento dos débitos do veículo em vários títulos.
 *
 * O campo de débitos é um total (IPVA + multas + licenciamento) que virava UMA
 * conta a pagar. Aqui ele pode ser aberto em linhas — cada uma com o seu
 * vencimento — e cada linha vira um título próprio.
 *
 * O componente cuida só da LISTA: quem renderiza o campo do total é a tela, que
 * recebe a soma por `onTotalChange` e a trava enquanto houver detalhamento. Sem
 * isso, o total e as linhas poderiam divergir (e o servidor recusa).
 *
 * Molde copiado das indicações de venda (SaleForm): linha-fantasma no fim e
 * JSON num `<input type="hidden">`.
 */
export default function DebtItemsField({
  name,
  initialItems = [],
  onTotalChange,
}: {
  /** Nome do hidden com o JSON (ex.: "tiDebtsItems" / "debtsItems"). */
  name: string;
  initialItems?: VehicleDebtItem[];
  /** Soma das linhas, ou null quando não há detalhamento. */
  onTotalChange: (total: number | null) => void;
}) {
  const [items, setItems] = useState<DebtRow[]>(
    initialItems.map((d) => ({
      description: d.description,
      amount: d.amount ? String(d.amount) : "",
      dueDate: d.dueDate ?? "",
    })),
  );
  const [open, setOpen] = useState(initialItems.length > 0);

  const rows: DebtRow[] = [...items, { description: "", amount: "", dueDate: "" }];
  const total = Math.round(items.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100;
  const json = JSON.stringify(
    items
      .filter((d) => d.description.trim() || Number(d.amount) > 0)
      .map((d) => ({
        description: d.description.trim(),
        amount: Number(d.amount) || 0,
        dueDate: d.dueDate || null,
      })),
  );

  function update(next: DebtRow[]) {
    setItems(next);
    onTotalChange(
      next.length ? Math.round(next.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100 : null,
    );
  }

  function setField(index: number, field: keyof DebtRow, value: string) {
    const next = [...items];
    if (index === next.length) next.push({ description: "", amount: "", dueDate: "" });
    next[index] = { ...next[index], [field]: value };
    // Remove a linha vazia do fim (a "próxima" é renderizada à parte).
    while (
      next.length > 0 &&
      !next[next.length - 1].description.trim() &&
      !next[next.length - 1].amount &&
      !next[next.length - 1].dueDate
    ) {
      next.pop();
    }
    update(next);
  }

  return (
    <>
      <input type="hidden" name={name} value={json} />
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 text-xs font-medium text-blue-700 hover:underline"
        >
          detalhar em vários títulos
        </button>
      ) : (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
          <p className="mb-1 text-[11px] text-slate-500">
            Cada linha vira uma conta a pagar. Sem data, vence junto com a compra.
          </p>
          {rows.map((row, i) => (
            <div key={i} className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Input
                value={row.description}
                onChange={(e) => setField(i, "description", e.target.value)}
                placeholder="Ex.: IPVA 2026"
                className="min-w-0 flex-1"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={row.amount}
                onChange={(e) => setField(i, "amount", e.target.value)}
                placeholder="Valor"
                className="w-28"
              />
              <Input
                type="date"
                value={row.dueDate}
                onChange={(e) => setField(i, "dueDate", e.target.value)}
                className="w-36"
              />
              {i < items.length ? (
                <button
                  type="button"
                  onClick={() => update(items.filter((_, k) => k !== i))}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Remover
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                update([]);
              }}
              className="text-slate-400 hover:underline"
            >
              voltar para valor único
            </button>
            <span className="font-medium text-slate-700">Total: {formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </>
  );
}
