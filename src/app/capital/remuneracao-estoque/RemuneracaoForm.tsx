"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { formatCurrency, toDateInputValue } from "@/lib/format";
import { runStockInterestAction, type StockInterestFormState } from "./actions";

type Vehicle = {
  id: string;
  orderNumber: number;
  brand: string;
  model: string;
  plate: string;
  modelYear: number;
  baseCusto: number;
};

type Beneficiary = { id: string; name: string };

type SplitRow = { beneficiaryId: string; percent: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function RemuneracaoForm({
  vehicles,
  beneficiaries,
}: {
  vehicles: Vehicle[];
  beneficiaries: Beneficiary[];
}) {
  const [state, formAction, pending] = useActionState(
    runStockInterestAction,
    {} as StockInterestFormState,
  );

  const [rate, setRate] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [splits, setSplits] = useState<SplitRow[]>([{ beneficiaryId: "", percent: "100" }]);

  // Reseta o formulário após uma execução bem-sucedida.
  useEffect(() => {
    if (state.ok) {
      setRate("");
      setSelected({});
      setSplits([{ beneficiaryId: "", percent: "100" }]);
    }
  }, [state.ok]);

  const rateNum = Number(rate.replace(",", ".")) || 0;

  const selectedIds = useMemo(
    () => vehicles.filter((v) => selected[v.id]).map((v) => v.id),
    [vehicles, selected],
  );
  const allChecked = vehicles.length > 0 && selectedIds.length === vehicles.length;

  const juroOf = (base: number) => round2(base * (rateNum / 100));
  const totalJuros = useMemo(
    () => round2(vehicles.filter((v) => selected[v.id]).reduce((s, v) => s + juroOf(v.baseCusto), 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, selected, rateNum],
  );

  const somaPercent = round2(splits.reduce((s, r) => s + (Number(r.percent.replace(",", ".")) || 0), 0));
  const percentOk = Math.abs(somaPercent - 100) < 0.01;

  const toggleAll = () => {
    if (allChecked) setSelected({});
    else setSelected(Object.fromEntries(vehicles.map((v) => [v.id, true])));
  };

  const splitsPayload = JSON.stringify(
    splits
      .map((r) => ({ beneficiaryId: r.beneficiaryId, percent: Number(r.percent.replace(",", ".")) || 0 }))
      .filter((r) => r.beneficiaryId && r.percent > 0),
  );

  const canSubmit =
    rateNum > 0 && selectedIds.length > 0 && percentOk && !pending;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Coluna esquerda: taxa + veículos */}
      <div className="space-y-4 lg:col-span-2">
        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Field label="Taxa de juros (%)" required>
                <Input
                  name="ratePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="Ex: 2"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </Field>
            </div>
            <p className="pb-2 text-sm text-slate-500">
              Aplicada sobre o <strong>custo total</strong> (compra + custos) de cada veículo
              selecionado.
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-900">
              Veículos em estoque{" "}
              <span className="text-sm font-normal text-slate-500">
                ({selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"})
              </span>
            </h2>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {allChecked ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {vehicles.map((v) => {
              const checked = !!selected[v.id];
              const juro = juroOf(v.baseCusto);
              return (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={checked}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [v.id]: e.target.checked }))
                    }
                  />
                  {checked ? <input type="hidden" name="vehicleIds" value={v.id} /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      #{v.orderNumber} · {v.brand} {v.model}{" "}
                      <span className="font-normal text-slate-500">
                        {v.plate} · {v.modelYear}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">Custo total {formatCurrency(v.baseCusto)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Juro</p>
                    <p
                      className={`tabular-nums font-semibold ${
                        checked && rateNum > 0 ? "text-emerald-600" : "text-slate-400"
                      }`}
                    >
                      {rateNum > 0 ? formatCurrency(juro) : "—"}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Coluna direita: rateio + data + total + submit */}
      <div className="space-y-4">
        <Card className="px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Rateio do capital</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Distribua o total de juros entre os sócios. A soma deve dar 100%.
          </p>
          <input type="hidden" name="splits" value={splitsPayload} />
          <div className="mt-3 space-y-2">
            {splits.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={row.beneficiaryId}
                  onChange={(e) =>
                    setSplits((prev) =>
                      prev.map((r, idx) => (idx === i ? { ...r, beneficiaryId: e.target.value } : r)),
                    )
                  }
                >
                  <option value="">Sócio…</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
                <div className="relative w-24">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={row.percent}
                    onChange={(e) =>
                      setSplits((prev) =>
                        prev.map((r, idx) => (idx === i ? { ...r, percent: e.target.value } : r)),
                      )
                    }
                    className="pr-6"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                    %
                  </span>
                </div>
                {splits.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setSplits((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="Remover"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSplits((prev) => [...prev, { beneficiaryId: "", percent: "" }])}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            + Adicionar sócio
          </button>
          <p className={`mt-2 text-sm font-medium ${percentOk ? "text-emerald-600" : "text-rose-600"}`}>
            Soma: {somaPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
            {percentOk ? " ✓" : " (precisa somar 100%)"}
          </p>
        </Card>

        <Card className="px-5 py-4 space-y-3">
          <Field label="Data" required>
            <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
          </Field>
          <Field label="Descrição (opcional)">
            <Textarea name="description" rows={2} placeholder="Ex: Remuneração de julho/2026" />
          </Field>
        </Card>

        <Card className="px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Total de juros</span>
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              {formatCurrency(totalJuros)}
            </span>
          </div>
          {state.error ? <p className="mt-3 text-sm text-rose-600">{state.error}</p> : null}
          {state.ok ? <p className="mt-3 text-sm text-emerald-600">Remuneração aplicada com sucesso.</p> : null}
          <Button type="submit" disabled={!canSubmit} className="mt-3 w-full">
            {pending ? "Aplicando..." : "Aplicar remuneração"}
          </Button>
        </Card>
      </div>
    </form>
  );
}
