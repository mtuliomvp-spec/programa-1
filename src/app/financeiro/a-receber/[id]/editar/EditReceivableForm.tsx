"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import CategoryInput from "@/components/CategoryInput";
import MoneyInput from "@/components/MoneyInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { toDateInputValue } from "@/lib/format";
import { updateReceivableAction, type EditReceivableState } from "../../actions";

type Option = { id: string; name: string };
type Receivable = {
  id: string;
  description: string;
  categoryLabel: string;
  documentNumber: string | null;
  amount: number;
  dueDate: string;
  customerId: string | null;
  capitalBeneficiaryId: string | null;
  costCenterId: string | null;
  structuralKey: string;
  notes: string | null;
};

export default function EditReceivableForm({
  receivable,
  customers,
  costCenters,
  beneficiaries,
  categories,
}: {
  receivable: Receivable;
  customers: Option[];
  costCenters: Option[];
  beneficiaries: Option[];
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(updateReceivableAction, {} as EditReceivableState);
  const [flow, setFlow] = useState(receivable.structuralKey || "ADMINISTRATIVO");
  const isCapital = flow === "CAPITAL";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={receivable.id} />
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <Field label="Descrição" required>
        <Input name="description" required defaultValue={receivable.description} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Categoria" required>
          <CategoryInput name="categoryLabel" options={categories} defaultValue={receivable.categoryLabel} />
        </Field>
        <Field label="Nº do documento">
          <Input name="documentNumber" defaultValue={receivable.documentNumber || ""} placeholder="Recibo, NF..." />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)" required>
          <MoneyInput name="amount" defaultValue={receivable.amount} required />
        </Field>
        <Field label="Vencimento" required>
          <Input
            name="dueDate"
            type="date"
            required
            defaultValue={toDateInputValue(new Date(receivable.dueDate))}
          />
        </Field>
      </div>

      <Field label="Cliente">
        <Select name="customerId" defaultValue={receivable.customerId || ""}>
          <option value="">Sem cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Fluxo (obra estrutural)">
        {/* Sem campo de veículo aqui — um recebível manual não é de um carro. */}
        <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
          {STRUCTURAL_FLOWS.filter((f) => f.key !== "VEICULOS").map((f) => (
            <option key={f.key} value={f.key}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>

      {isCapital ? (
        <Field label="Beneficiário do capital" required>
          <Select name="capitalBeneficiaryId" defaultValue={receivable.capitalBeneficiaryId || ""} required>
            <option value="">Selecione o beneficiário</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            Quando o título for recebido, vira um aporte no capital desse sócio.
          </p>
        </Field>
      ) : (
        <Field label="Centro de custo (obra, imóvel...)">
          <Select name="costCenterId" defaultValue={receivable.costCenterId || ""}>
            <option value="">Nenhum (usa o fluxo acima)</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Observações">
        <Textarea name="notes" rows={2} defaultValue={receivable.notes || ""} />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
