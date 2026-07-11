"use client";

import { useState, useTransition } from "react";
import { fetchVehicleDebtsAction, importVehicleDebtsAction } from "../actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Button } from "@/components/ui";

type Debt = {
  category: "IPVA" | "MULTA" | "LICENCIAMENTO";
  description: string;
  amount: number;
  dueDate: string;
};

const categoryLabel = { IPVA: "IPVA", MULTA: "Multa", LICENCIAMENTO: "Licenciamento" } as const;
const categoryTone = { IPVA: "info", MULTA: "danger", LICENCIAMENTO: "warning" } as const;

export default function VehicleDebtsLookup({ vehicleId }: { vehicleId: string }) {
  const [pending, startTransition] = useTransition();
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function handleFetch() {
    setMessage(null);
    startTransition(async () => {
      const result = await fetchVehicleDebtsAction(vehicleId);
      if (!result.ok) {
        setDebts(null);
        setMessage({ tone: "err", text: result.error });
        return;
      }
      setDebts(result.debts);
      setSelected(new Set(result.debts.map((_, i) => i)));
    });
  }

  function handleImport() {
    if (!debts) return;
    const chosen = debts.filter((_, i) => selected.has(i));
    if (chosen.length === 0) {
      setMessage({ tone: "err", text: "Selecione ao menos um débito para importar." });
      return;
    }
    startTransition(async () => {
      const { imported } = await importVehicleDebtsAction(vehicleId, chosen);
      setDebts(null);
      setMessage({
        tone: "ok",
        text: `${imported} débito(s) importado(s) como custos do veículo, com contas a pagar pendentes.`,
      });
    });
  }

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={handleFetch} disabled={pending}>
          {pending && !debts ? "Consultando..." : "🚦 Consultar débitos pela placa"}
        </Button>
        <p className="text-xs text-slate-400">
          IPVA, multas e licenciamento em aberto no Detran (via API Placas)
        </p>
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm font-medium ${
            message.tone === "ok" ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {debts ? (
        <div className="mt-3 space-y-2">
          {debts.map((debt, i) => (
            <label
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <Badge tone={categoryTone[debt.category]}>{categoryLabel[debt.category]}</Badge>
                <span className="truncate text-sm text-slate-800">{debt.description}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  vence {formatDate(debt.dueDate)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-slate-900">
                {formatCurrency(debt.amount)}
              </span>
            </label>
          ))}
          <Button type="button" onClick={handleImport} disabled={pending}>
            {pending ? "Importando..." : `Importar selecionados (${selected.size})`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
