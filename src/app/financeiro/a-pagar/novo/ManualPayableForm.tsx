"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import CategoryInput from "@/components/CategoryInput";
import SupplierInput from "@/components/SupplierInput";
import NewSupplierInline from "@/components/NewSupplierInline";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { createManualPayableAction, type ManualPayableState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type CostCenter = { id: string; name: string };
type Vehicle = { id: string; label: string };
type Beneficiary = { id: string; name: string };

export default function ManualPayableForm({
  supplierNames,
  costCenters,
  vehicles,
  beneficiaries,
  categories,
}: {
  supplierNames: string[];
  costCenters: CostCenter[];
  vehicles: Vehicle[];
  beneficiaries: Beneficiary[];
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(createManualPayableAction, {} as ManualPayableState);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [flow, setFlow] = useState<string>("ADMINISTRATIVO");
  const [supplierName, setSupplierName] = useState("");
  const [newSupplier, setNewSupplier] = useState(false);
  const isCapital = flow === "CAPITAL";

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <Field label="Descrição" required>
        <Input name="description" required placeholder="Ex: Aluguel do salão de vendas" />
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

      {flow === "VEICULOS" ? (
        <Field label="Veículo (opcional)">
          <Select name="vehicleId" defaultValue="">
            <option value="">Nenhum (custo geral de veículos)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
          {vehicles.length > 0 ? (
            <p className="mt-1 text-xs text-slate-400">O valor entra no custo desse veículo.</p>
          ) : null}
        </Field>
      ) : null}

      {isCapital ? (
        <Field label="Beneficiário do capital" required>
          <Select name="capitalBeneficiaryId" defaultValue="" required>
            <option value="">Selecione o beneficiário</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Categoria" required>
          <CategoryInput name="categoryLabel" options={categories} defaultValue="Outros" />
        </Field>
        <Field label="Fornecedor" required>
          <SupplierInput
            name="supplierName"
            suppliers={supplierNames}
            value={supplierName}
            onValueChange={setSupplierName}
            required
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              {isCapital ? "A quem o valor foi pago." : "Numa tarifa bancária, escolha o próprio banco."}
            </p>
            <button
              type="button"
              onClick={() => setNewSupplier((v) => !v)}
              className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
            >
              {newSupplier ? "Fechar" : "➕ Cadastrar fornecedor"}
            </button>
          </div>
          {newSupplier ? (
            <NewSupplierInline
              onCreated={(nm) => {
                setSupplierName(nm);
                setNewSupplier(false);
              }}
            />
          ) : null}
        </Field>
        <Field label="Valor" required>
          <Input type="number" step="0.01" min={0.01} name="amount" required />
        </Field>
        <Field label="Vencimento" required>
          <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} required />
        </Field>
        {!isCapital ? (
          <Field label="Centro de custo (obra, imóvel...)">
            <Select name="costCenterId" defaultValue="">
              <option value="">Nenhum (usa o fluxo acima)</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="alreadyPaid"
          value="true"
          checked={alreadyPaid}
          onChange={(e) => setAlreadyPaid(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Já foi pago
      </label>
      <Field label="Observações">
        <Textarea name="notes" rows={3} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Lançar conta"}
        </Button>
      </div>
    </form>
  );
}
