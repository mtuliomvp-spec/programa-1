"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import CategoryInput from "@/components/CategoryInput";
import SupplierInput from "@/components/SupplierInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { createCashEntryAction, type CashEntryState } from "./actions";

type Account = { id: string; name: string };
type Vehicle = { id: string; label: string };
type Beneficiary = { id: string; name: string };

const initial: CashEntryState = {};

export default function CashEntryForm({
  accounts,
  supplierNames,
  vehicles,
  beneficiaries,
  categories,
  defaultDate,
  preselectedAccountId,
}: {
  accounts: Account[];
  supplierNames: string[];
  vehicles: Vehicle[];
  beneficiaries: Beneficiary[];
  categories: string[];
  defaultDate: string;
  preselectedAccountId?: string;
}) {
  const [state, formAction, pending] = useActionState(createCashEntryAction, initial);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"entrada" | "saida">("saida");
  const [flow, setFlow] = useState<string>("ADMINISTRATIVO");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setKind("saida");
      setFlow("ADMINISTRATIVO");
    }
  }, [state.ok]);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Cadastre uma conta financeira (caixa/banco) para poder lançar no movimento de caixa.
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="print:hidden">
        ➕ Novo lançamento
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-slate-800">Novo lançamento no caixa</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Fechar
        </button>
      </div>

      {state.error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Lançamento registrado. Pode adicionar outro.
        </p>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              kind === "entrada"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-500"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value="entrada"
              className="sr-only"
              checked={kind === "entrada"}
              onChange={() => setKind("entrada")}
            />
            📥 Entrada
          </label>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              kind === "saida"
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-200 text-slate-500"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value="saida"
              className="sr-only"
              checked={kind === "saida"}
              onChange={() => setKind("saida")}
            />
            📤 Saída
          </label>
        </div>

        <Field label="Descrição" required>
          <Input name="description" required placeholder="Ex.: Tarifa bancária / Venda de sucata" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" required>
            <Input name="amount" type="number" step="0.01" min={0.01} required />
          </Field>
          <Field label="Data" required>
            <Input name="date" type="date" defaultValue={defaultDate} required />
          </Field>
        </div>

        <Field label="Conta" required>
          <Select name="accountId" defaultValue={preselectedAccountId || accounts[0]?.id} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fluxo (obra estrutural)">
          <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
            {STRUCTURAL_FLOWS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>

        {kind === "saida" && flow === "VEICULOS" ? (
          <Field label="Veículo (opcional)">
            <Select name="vehicleId" defaultValue="">
              <option value="">Nenhum (custo geral de veículos)</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
            {vehicles.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">Nenhum veículo em estoque.</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                O valor entra no custo pago desse veículo.
              </p>
            )}
          </Field>
        ) : null}

        {kind === "saida" && flow === "CAPITAL" ? (
          <Field label="Beneficiário do capital" required>
            <Select name="capitalBeneficiaryId" defaultValue="" required>
              <option value="">Selecione o beneficiário</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            {beneficiaries.length === 0 ? (
              <p className="mt-1 text-xs text-amber-600">
                Nenhum beneficiário cadastrado. Cadastre em Capital.
              </p>
            ) : null}
          </Field>
        ) : null}

        {kind === "saida" ? (
          <>
            <Field label="Categoria" required>
              <CategoryInput name="categoryLabel" options={categories} defaultValue="Outros" />
            </Field>
            {flow !== "CAPITAL" ? (
              <Field label="Fornecedor" required>
                <SupplierInput name="supplierName" suppliers={supplierNames} required />
                <p className="mt-1 text-xs text-slate-400">
                  Numa tarifa bancária, escolha o próprio banco.
                </p>
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="Observações">
          <Textarea name="notes" rows={2} />
        </Field>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Lançando..." : "Lançar no caixa"}
        </Button>
      </form>
    </div>
  );
}
