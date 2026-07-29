"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import MoneyInput from "@/components/MoneyInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { toDateInputValue } from "@/lib/format";
import { updatePayableAction, type EditPayableState } from "../../actions";

type Supplier = { id: string; name: string };
type Vehicle = { id: string; label: string };
type Beneficiary = { id: string; name: string };
type Payable = {
  id: string;
  description: string;
  categoryLabel: string;
  documentNumber: string | null;
  amount: number;
  dueDate: string;
  supplierId: string | null;
  notes: string | null;
  structuralKey: string;
  vehicleId: string | null;
  capitalBeneficiaryId: string | null;
};

export default function EditPayableForm({
  payable,
  suppliers,
  vehicles,
  beneficiaries,
}: {
  payable: Payable;
  suppliers: Supplier[];
  vehicles: Vehicle[];
  beneficiaries: Beneficiary[];
}) {
  const [state, formAction, pending] = useActionState(updatePayableAction, {} as EditPayableState);
  const [flow, setFlow] = useState(payable.structuralKey || "ADMINISTRATIVO");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={payable.id} />
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <Field label="Descrição" required>
        <Input name="description" required defaultValue={payable.description} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Categoria" required>
          <Input name="categoryLabel" required defaultValue={payable.categoryLabel} placeholder="Ex: Compra de peças" />
        </Field>
        <Field label="Nº da NF / documento">
          <Input name="documentNumber" defaultValue={payable.documentNumber || ""} placeholder="Ex: NF 12345" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)" required>
          <MoneyInput name="amount" defaultValue={payable.amount} required />
        </Field>
        <Field label="Vencimento" required>
          <Input name="dueDate" type="date" required defaultValue={toDateInputValue(new Date(payable.dueDate))} />
        </Field>
      </div>

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
          <Select name="vehicleId" defaultValue={payable.vehicleId || ""}>
            <option value="">Nenhum (custo geral de veículos)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">O valor entra no custo desse veículo (ou pós-venda, se já vendido).</p>
        </Field>
      ) : null}

      {flow === "CAPITAL" ? (
        <Field label="Beneficiário do capital" required>
          <Select name="capitalBeneficiaryId" defaultValue={payable.capitalBeneficiaryId || ""} required>
            <option value="">Selecione o beneficiário</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SupplierSelect
        suppliers={suppliers}
        label="Fornecedor"
        emptyLabel="Sem fornecedor"
        defaultValue={payable.supplierId || ""}
      />

      <Field label="Observações">
        <Textarea name="notes" rows={2} defaultValue={payable.notes || ""} />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
