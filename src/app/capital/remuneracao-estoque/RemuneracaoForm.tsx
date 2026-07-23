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

type SplitMode = "PERCENT" | "VALOR";
// `value` é o número digitado no modo atual (percentual ou R$).
type SplitRow = { beneficiaryId: string; value: string };

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
  const [splitMode, setSplitMode] = useState<SplitMode>("PERCENT");
  const [splits, setSplits] = useState<SplitRow[]>([{ beneficiaryId: "", value: "100" }]);

  // Reseta o formulário após uma execução bem-sucedida.
  useEffect(() => {
    if (state.ok) {
      setRate("");
      setSelected({});
      setSplitMode("PERCENT");
      setSplits([{ beneficiaryId: "", value: "100" }]);
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

  const num = (s: string) => Number(s.replace(",", ".")) || 0;
  const somaRateio = round2(splits.reduce((s, r) => s + num(r.value), 0));
  const percentOk = splitMode === "PERCENT" && Math.abs(somaRateio - 100) < 0.01;
  const valorOk = splitMode === "VALOR" && totalJuros > 0 && Math.abs(somaRateio - totalJuros) < 0.01;
  const rateioOk = splitMode === "PERCENT" ? percentOk : valorOk;
  const faltaValor = round2(totalJuros - somaRateio);

  // Troca o modo do rateio, convertendo os números quando há total de juros.
  const changeMode = (mode: SplitMode) => {
    if (mode === splitMode) return;
    setSplits((prev) =>
      prev.map((r) => {
        const v = num(r.value);
        let converted = "";
        if (totalJuros > 0) {
          converted =
            mode === "VALOR"
              ? String(round2((totalJuros * v) / 100))
              : String(round2((v / totalJuros) * 100));
        }
        return { ...r, value: converted };
      }),
    );
    setSplitMode(mode);
  };

  const toggleAll = () => {
    if (allChecked) setSelected({});
    else setSelected(Object.fromEntries(vehicles.map((v) => [v.id, true])));
  };

  const splitsPayload = JSON.stringify(
    splits
      .map((r) =>
        splitMode === "VALOR"
          ? { beneficiaryId: r.beneficiaryId, amount: num(r.value) }
          : { beneficiaryId: r.beneficiaryId, percent: num(r.value) },
      )
      .filter((r) => r.beneficiaryId),
  );

  const canSubmit = rateNum > 0 && selectedIds.length > 0 && rateioOk && !pending;

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Rateio do capital</h2>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => changeMode("PERCENT")}
                className={`rounded-md px-3 py-1 font-medium ${
                  splitMode === "PERCENT" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Por %
              </button>
              <button
                type="button"
                onClick={() => changeMode("VALOR")}
                className={`rounded-md px-3 py-1 font-medium ${
                  splitMode === "VALOR" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Por R$
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {splitMode === "PERCENT"
              ? "Distribua o total de juros entre os sócios. A soma deve dar 100%."
              : "Informe quanto cada sócio recebe. A soma deve dar o total de juros."}
          </p>
          <input type="hidden" name="splits" value={splitsPayload} />
          <input type="hidden" name="splitMode" value={splitMode} />
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
                <div className={`relative ${splitMode === "VALOR" ? "w-32" : "w-24"}`}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={row.value}
                    onChange={(e) =>
                      setSplits((prev) =>
                        prev.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)),
                      )
                    }
                    className={splitMode === "VALOR" ? "pl-9" : "pr-6"}
                  />
                  <span
                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-slate-400 ${
                      splitMode === "VALOR" ? "left-2.5" : "right-2"
                    }`}
                  >
                    {splitMode === "VALOR" ? "R$" : "%"}
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
            onClick={() => setSplits((prev) => [...prev, { beneficiaryId: "", value: "" }])}
            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            + Adicionar sócio
          </button>
          {splitMode === "PERCENT" ? (
            <p className={`mt-2 text-sm font-medium ${percentOk ? "text-emerald-600" : "text-rose-600"}`}>
              Soma: {somaRateio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
              {percentOk ? " ✓" : " (precisa somar 100%)"}
            </p>
          ) : (
            <p className={`mt-2 text-sm font-medium ${valorOk ? "text-emerald-600" : "text-rose-600"}`}>
              Soma: {formatCurrency(somaRateio)} de {formatCurrency(totalJuros)}
              {valorOk
                ? " ✓"
                : totalJuros <= 0
                  ? " (selecione veículos e a taxa)"
                  : faltaValor > 0
                    ? ` (faltam ${formatCurrency(faltaValor)})`
                    : ` (excede ${formatCurrency(-faltaValor)})`}
            </p>
          )}
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
