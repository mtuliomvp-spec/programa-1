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
 * O campo do total (na tela) é o valor ACORDADO com o antigo dono — o que foi
 * descontado dele. As linhas são as GUIAS REAIS. Os dois podem divergir, e é
 * normal: a diferença vira custo do veículo (guias maiores) ou desconto (guias
 * menores). Este componente só mostra a comparação; quem lança é o servidor.
 *
 * Molde copiado das indicações de venda (SaleForm): linha-fantasma no fim e
 * JSON num `<input type="hidden">`.
 */
export default function DebtItemsField({
  name,
  initialItems = [],
  agreed,
  mode = "custo",
  startOpen = false,
}: {
  /** Nome do hidden com o JSON (ex.: "tiDebtsItems" / "debtsItems"). */
  name: string;
  initialItems?: VehicleDebtItem[];
  /** Total acordado com o antigo dono, para comparar com as guias. */
  agreed: number;
  /**
   * Para onde vai a diferença guias × acordado: "custo" (compra/troca — vira
   * custo do veículo), "devolucao" (consignado — ajusta a devolução ao dono) ou
   * "exato" (a soma PRECISA bater com o total — nada absorve diferença).
   */
  mode?: "custo" | "devolucao" | "exato";
  /** Abre a lista de guias já expandida (sem o botão "detalhar"). */
  startOpen?: boolean;
}) {
  const [items, setItems] = useState<DebtRow[]>(
    initialItems.map((d) => ({
      description: d.description,
      amount: d.amount ? String(d.amount) : "",
      dueDate: d.dueDate ?? "",
    })),
  );
  const [open, setOpen] = useState(initialItems.length > 0 || startOpen);

  const rows: DebtRow[] = [...items, { description: "", amount: "", dueDate: "" }];
  const total = Math.round(items.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100;
  // Guias × acordado: a diferença é o que vira custo (ou desconto) do veículo.
  const diff = Math.round((total - (agreed || 0)) * 100) / 100;
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
            {mode === "exato"
              ? "Cada linha vira uma conta a pagar. Sem data, vence na data do título."
              : "Cada linha vira uma conta a pagar. Sem data, vence junto com a compra."}
          </p>
          {rows.map((row, i) => (
            <div key={i} className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Input
                value={row.description}
                onChange={(e) => setField(i, "description", e.target.value)}
                placeholder={mode === "exato" ? "Ex.: 1ª parte" : "Ex.: IPVA 2026"}
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
            <span className="font-medium text-slate-700">
              {mode === "exato" ? "Linhas somam" : "Guias somam"} {formatCurrency(total)}
            </span>
          </div>
          {items.length && Math.abs(diff) > 0.005 ? (
            <p
              className={`pt-1 text-[11px] font-medium ${
                mode === "exato"
                  ? diff > 0
                    ? "text-rose-600"
                    : "text-amber-700"
                  : diff > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
              }`}
            >
              {mode === "exato"
                ? diff > 0
                  ? `${formatCurrency(diff)} acima do valor do título — a soma precisa ser igual.`
                  : `Faltam ${formatCurrency(-diff)} para fechar o valor do título.`
                : mode === "devolucao"
                  ? diff > 0
                    ? `${formatCurrency(diff)} acima do descontado — sai da devolução ao proprietário.`
                    : `${formatCurrency(-diff)} abaixo do descontado — volta para a devolução ao proprietário.`
                  : diff > 0
                    ? `${formatCurrency(diff)} acima do acordado — entra como custo do veículo.`
                    : `${formatCurrency(-diff)} abaixo do acordado — reduz o custo do veículo.`}
            </p>
          ) : null}
          {mode === "exato" && items.length && Math.abs(diff) <= 0.005 ? (
            <p className="pt-1 text-[11px] font-medium text-emerald-700">
              Soma confere com o valor do título. ✓
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
