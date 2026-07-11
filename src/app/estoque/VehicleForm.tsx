"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import {
  createVehicleAction,
  updateVehicleAction,
  lookupPlateAction,
  type VehicleFormState,
} from "./actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";

type Supplier = { id: string; name: string };

type VehicleData = {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  manufactureYear: number;
  modelYear: number;
  plate: string;
  chassi: string | null;
  color: string | null;
  km: number;
  fuel: string | null;
  transmission: string | null;
  purchasePrice: number;
  salePrice: number;
  entryDate: Date;
  notes: string | null;
  supplierId: string | null;
};

const initialState: VehicleFormState = {};

export default function VehicleForm({
  suppliers,
  vehicle,
}: {
  suppliers: Supplier[];
  vehicle?: VehicleData;
}) {
  const isEdit = Boolean(vehicle);
  const action = isEdit ? updateVehicleAction : createVehicleAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [alreadyPaid, setAlreadyPaid] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [fipeOptions, setFipeOptions] = useState<{ modelo: string; price: number }[]>([]);
  const [fipeChoice, setFipeChoice] = useState(0);

  function setField(name: string, value: string | number | undefined) {
    if (value === undefined || value === "") return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      if (el instanceof HTMLSelectElement) {
        const match = Array.from(el.options).find((o) => o.value === String(value));
        if (!match) return;
      }
      el.value = String(value);
    }
  }

  function handlePlateLookup() {
    const plateEl = formRef.current?.elements.namedItem("plate");
    const plate = plateEl instanceof HTMLInputElement ? plateEl.value.trim() : "";
    if (!plate) {
      setLookupMsg({ tone: "err", text: "Digite a placa antes de buscar." });
      return;
    }
    setLookupMsg(null);
    setFipeOptions([]);
    startLookup(async () => {
      const result = await lookupPlateAction(plate);
      if (!result.ok) {
        setLookupMsg({ tone: "err", text: result.error });
        return;
      }
      const d = result.data;
      setField("brand", d.brand);
      setField("model", d.model);
      setField("version", d.version);
      setField("manufactureYear", d.manufactureYear);
      setField("modelYear", d.modelYear ?? d.manufactureYear);
      setField("chassi", d.chassi);
      setField("color", d.color);
      setField("fuel", d.fuel);
      // sugere o preço FIPE como preço de venda se ainda não preenchido
      const saleEl = formRef.current?.elements.namedItem("salePrice");
      if (d.fipePrice && saleEl instanceof HTMLInputElement && !saleEl.value) {
        saleEl.value = String(d.fipePrice);
      }
      setFipeOptions(d.fipeOptions ?? []);
      setFipeChoice(0);
      const found = [d.brand, d.model, d.modelYear].filter(Boolean).join(" ");
      setLookupMsg({
        tone: "ok",
        text: `Dados encontrados: ${found || "veículo"}${
          d.fipePrice ? ` · FIPE ${formatCurrency(d.fipePrice)}` : ""
        }. Confira e complete o que faltar.`,
      });
    });
  }

  function chooseFipe(index: number) {
    setFipeChoice(index);
    const option = fipeOptions[index];
    const saleEl = formRef.current?.elements.namedItem("salePrice");
    if (option && saleEl instanceof HTMLInputElement) {
      saleEl.value = String(option.price);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" defaultValue={vehicle!.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
        <Field label="Placa" required>
          <div className="flex flex-wrap gap-2">
            <Input
              name="plate"
              defaultValue={vehicle?.plate}
              required
              placeholder="ABC1D23"
              className="max-w-[180px] uppercase"
            />
            <Button type="button" variant="secondary" onClick={handlePlateLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pela placa"}
            </Button>
          </div>
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Digite a placa e clique em buscar: marca, modelo, ano, cor, chassi e o valor FIPE são
          preenchidos automaticamente.
        </p>
        {lookupMsg ? (
          <p
            className={`mt-2 text-sm font-medium ${
              lookupMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {lookupMsg.text}
          </p>
        ) : null}
        {fipeOptions.length > 1 ? (
          <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-700">
              A tabela FIPE tem {fipeOptions.length} versões para este veículo. Toque na versão
              correta para ajustar o valor:
            </p>
            <div className="mt-2 space-y-1.5">
              {fipeOptions.map((option, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    fipeChoice === i
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    checked={fipeChoice === i}
                    onChange={() => chooseFipe(i)}
                    className="mt-0.5 h-4 w-4 shrink-0 border-slate-300"
                  />
                  <span className="min-w-0">
                    <span className="block text-slate-700">{option.modelo}</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(option.price)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              O valor da versão escolhida vai para o campo &quot;Preço de venda (anúncio)&quot;.
              Você pode ajustá-lo depois.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Marca" required>
          <Input name="brand" defaultValue={vehicle?.brand} required placeholder="Ex: Volkswagen" />
        </Field>
        <Field label="Modelo" required>
          <Input name="model" defaultValue={vehicle?.model} required placeholder="Ex: Gol" />
        </Field>
        <Field label="Versão">
          <Input name="version" defaultValue={vehicle?.version || ""} placeholder="Ex: 1.6 MSI" />
        </Field>
        <Field label="Ano fabricação" required>
          <Input type="number" name="manufactureYear" defaultValue={vehicle?.manufactureYear ?? new Date().getFullYear()} required />
        </Field>
        <Field label="Ano modelo" required>
          <Input type="number" name="modelYear" defaultValue={vehicle?.modelYear ?? new Date().getFullYear()} required />
        </Field>
        <Field label="Chassi (VIN)">
          <Input name="chassi" defaultValue={vehicle?.chassi || ""} />
        </Field>
        <Field label="Cor">
          <Input name="color" defaultValue={vehicle?.color || ""} />
        </Field>
        <Field label="Quilometragem">
          <Input type="number" name="km" defaultValue={vehicle?.km ?? 0} min={0} />
        </Field>
        <Field label="Combustível">
          <Select name="fuel" defaultValue={vehicle?.fuel || ""}>
            <option value="">Selecione</option>
            <option value="Flex">Flex</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Diesel">Diesel</option>
            <option value="Híbrido">Híbrido</option>
            <option value="Elétrico">Elétrico</option>
          </Select>
        </Field>
        <Field label="Câmbio">
          <Select name="transmission" defaultValue={vehicle?.transmission || ""}>
            <option value="">Selecione</option>
            <option value="Manual">Manual</option>
            <option value="Automático">Automático</option>
            <option value="CVT">CVT</option>
          </Select>
        </Field>
        <Field label="Data de entrada" required>
          <Input
            type="date"
            name="entryDate"
            defaultValue={vehicle ? toDateInputValue(vehicle.entryDate) : toDateInputValue(new Date())}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Preço de compra (custo)" required>
          <Input type="number" step="0.01" min={0} name="purchasePrice" defaultValue={vehicle?.purchasePrice} required />
        </Field>
        <Field label="Preço de venda (anúncio)" required>
          <Input type="number" step="0.01" min={0} name="salePrice" defaultValue={vehicle?.salePrice} required />
        </Field>
        <Field label="Fornecedor de origem">
          <Select name="supplierId" defaultValue={vehicle?.supplierId || ""}>
            <option value="">Sem fornecedor / particular</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!isEdit ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Financeiro da compra</p>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="alreadyPaid"
              value="true"
              checked={alreadyPaid}
              onChange={(e) => setAlreadyPaid(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Compra já foi paga ao fornecedor
          </label>
          {!alreadyPaid ? (
            <div className="mt-3 max-w-xs">
              <Field label="Vencimento do pagamento">
                <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} />
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                Será lançada automaticamente uma conta a pagar para este veículo.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Nenhuma conta a pagar será gerada, pois a compra já está quitada.
            </p>
          )}
        </div>
      ) : null}

      <Field label="Observações">
        <Textarea name="notes" defaultValue={vehicle?.notes || ""} rows={3} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar veículo"}
        </Button>
      </div>
    </form>
  );
}
