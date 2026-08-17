"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { formatCurrency } from "@/lib/format";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_STATES,
  OPTIONALS,
  type ChecklistMap,
  type ChecklistState,
} from "@/lib/appraisals";
import {
  createAppraisalAction,
  updateAppraisalAction,
  lookupAppraisalPlateAction,
  type AppraisalFormState,
} from "./actions";

export type AppraisalInitial = {
  id: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  manufactureYear: number | null;
  modelYear: number | null;
  color: string | null;
  fuel: string | null;
  transmission: string | null;
  km: number | null;
  chassi: string | null;
  renavam: string | null;
  fipePrice: number | null;
  fipeModelo: string | null;
  appraisalPrice: number | null;
  ownerAskingPrice: number | null;
  notes: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  optionals: string[];
  checklist: ChecklistMap;
};

const FUELS = ["Flex", "Gasolina", "Etanol", "Diesel", "GNV", "Elétrico", "Híbrido"];
const TRANSMISSIONS = ["Manual", "Automático", "Automatizado", "CVT"];

export default function AppraisalForm({ initial }: { initial?: AppraisalInitial }) {
  const isEdit = !!initial;
  const action = isEdit ? updateAppraisalAction : createAppraisalAction;
  const [state, formAction, pending] = useActionState<AppraisalFormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Opcionais extra (fora da lista predefinida) já cadastrados na avaliação.
  const extraOptionals = (initial?.optionals ?? []).filter((o) => !OPTIONALS.includes(o));

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
    startLookup(async () => {
      const result = await lookupAppraisalPlateAction(plate);
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
      setField("renavam", d.renavam);
      setField("color", d.color);
      setField("fuel", d.fuel);
      setField("transmission", d.transmission);
      setField("fipePrice", d.fipePrice);
      setField("fipeModelo", d.fipeModelo);
      const found = [d.brand, d.model, d.modelYear].filter(Boolean).join(" ");
      setLookupMsg({
        tone: "ok",
        text: `Dados encontrados: ${found || "veículo"}${
          d.fipePrice ? ` · FIPE ${formatCurrency(d.fipePrice)}` : ""
        }. Confira e complete o que faltar.`,
      });
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" defaultValue={initial!.id} /> : null}
      {/* Preenchidos pela consulta de placa (não editáveis diretamente). */}
      <input type="hidden" name="fipePrice" defaultValue={initial?.fipePrice ?? ""} />
      <input type="hidden" name="fipeModelo" defaultValue={initial?.fipeModelo ?? ""} />

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
        <Field label="Placa">
          <div className="flex flex-wrap gap-2">
            <Input
              name="plate"
              defaultValue={initial?.plate ?? ""}
              placeholder="ABC1D23"
              className="max-w-[180px] uppercase"
            />
            <Button type="button" variant="secondary" onClick={handlePlateLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pela placa"}
            </Button>
          </div>
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Digite a placa e busque na FIPE: marca, modelo, ano, cor, chassi e o valor FIPE são
          preenchidos automaticamente. Confira e ajuste o que faltar.
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Marca" required>
          <Input name="brand" defaultValue={initial?.brand ?? ""} required placeholder="Ex: Volkswagen" />
        </Field>
        <Field label="Modelo" required>
          <Input name="model" defaultValue={initial?.model ?? ""} required placeholder="Ex: Gol" />
        </Field>
        <Field label="Versão">
          <Input name="version" defaultValue={initial?.version ?? ""} placeholder="Ex: 1.6 MSI" />
        </Field>
        <Field label="Ano fabricação">
          <Input type="number" name="manufactureYear" defaultValue={initial?.manufactureYear ?? ""} />
        </Field>
        <Field label="Ano modelo">
          <Input type="number" name="modelYear" defaultValue={initial?.modelYear ?? ""} />
        </Field>
        <Field label="KM">
          <Input type="number" name="km" defaultValue={initial?.km ?? ""} placeholder="Quilometragem" />
        </Field>
        <Field label="Cor">
          <Input name="color" defaultValue={initial?.color ?? ""} placeholder="Ex: Prata" />
        </Field>
        <Field label="Combustível">
          <Select name="fuel" defaultValue={initial?.fuel ?? ""}>
            <option value="">—</option>
            {FUELS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Câmbio">
          <Select name="transmission" defaultValue={initial?.transmission ?? ""}>
            <option value="">—</option>
            {TRANSMISSIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chassi (VIN)">
          <Input name="chassi" defaultValue={initial?.chassi ?? ""} className="uppercase" />
        </Field>
        <Field label="RENAVAM">
          <Input name="renavam" defaultValue={initial?.renavam ?? ""} inputMode="numeric" />
        </Field>
        <Field label="Preço da avaliação (R$)">
          <MoneyInput name="appraisalPrice" defaultValue={initial?.appraisalPrice ?? undefined} />
        </Field>
        <Field label="Valor pedido pelo proprietário (R$)">
          <MoneyInput name="ownerAskingPrice" defaultValue={initial?.ownerAskingPrice ?? undefined} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Proprietário / ofertante">
          <Input name="ownerName" defaultValue={initial?.ownerName ?? ""} placeholder="Nome de quem ofereceu o carro" />
        </Field>
        <Field label="Telefone do proprietário">
          <Input name="ownerPhone" defaultValue={initial?.ownerPhone ?? ""} placeholder="(00) 00000-0000" />
        </Field>
      </div>

      {/* Opcionais — lista predefinida marcável + extras livres */}
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Opcionais</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OPTIONALS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="optionals"
                value={opt}
                defaultChecked={initial?.optionals.includes(opt)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {opt}
            </label>
          ))}
        </div>
        <div className="mt-3">
          <Field label="Outros opcionais (um por linha ou separados por vírgula)">
            <Textarea
              name="optionalsExtra"
              rows={2}
              defaultValue={extraOptionals.join(", ")}
              placeholder="Ex: som premium, insulfilm, kit multimídia..."
            />
          </Field>
        </div>
      </fieldset>

      {/* Checklist padrão do veículo (marcável) */}
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Checklist do veículo</legend>
        <p className="mb-3 text-xs text-slate-500">
          Marque o estado de cada item. Este mesmo checklist é re-marcado na conferência da entrega
          para saber se o carro está do mesmo jeito em que foi avaliado.
        </p>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => {
            const current = initial?.checklist[item.key]?.state ?? "OK";
            const obs = initial?.checklist[item.key]?.obs ?? "";
            return (
              <div
                key={item.key}
                className="grid grid-cols-1 gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-slate-700">{item.label}</span>
                  <div className="flex gap-3">
                    {CHECKLIST_STATES.map((s) => (
                      <label key={s.value} className="flex items-center gap-1.5 text-sm text-slate-600">
                        <input
                          type="radio"
                          name={`cl_${item.key}`}
                          value={s.value}
                          defaultChecked={current === (s.value as ChecklistState)}
                          className="h-4 w-4 border-slate-300"
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>
                <Input
                  name={`cl_obs_${item.key}`}
                  defaultValue={obs}
                  placeholder="Observação (opcional)"
                  className="sm:w-64"
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <Field label="Observações gerais">
        <Textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Anotações da avaliação..." />
      </Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar avaliação"}
        </Button>
      </div>
    </form>
  );
}
