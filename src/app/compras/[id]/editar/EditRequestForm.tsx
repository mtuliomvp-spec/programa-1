"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import MoneyInput from "@/components/MoneyInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { toDateInputValue } from "@/lib/format";
import { updateRequestAction, type ComprasFormState } from "../../actions";

type Option = { id: string; name: string };
type Vehicle = { id: string; label: string };
type Request = {
  id: string;
  description: string;
  details: string | null;
  estimatedAmount: number | null;
  dueDate: string | null;
  documentNumber: string | null;
  category: string;
  installmentsCount: number;
  installmentPeriod: string | null;
  installmentDays: number;
  structuralKey: string | null;
  vehicleId: string | null;
  capitalBeneficiaryId: string | null;
  supplierId: string | null;
};

export default function EditRequestForm({
  request,
  suppliers,
  vehicles,
  beneficiaries,
}: {
  request: Request;
  suppliers: Option[];
  vehicles: Vehicle[];
  beneficiaries: Option[];
}) {
  const [state, formAction, pending] = useActionState(updateRequestAction, {} as ComprasFormState);
  const [flow, setFlow] = useState(request.structuralKey || "ADMINISTRATIVO");
  const [parcelado, setParcelado] = useState(request.installmentsCount > 1);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={request.id} />
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <Field label="O que comprar" required>
        <Input name="description" required defaultValue={request.description} placeholder="Ex: 4 pneus aro 15" />
      </Field>
      <Field label="Detalhes / justificativa">
        <Textarea name="details" rows={3} defaultValue={request.details || ""} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)">
          <MoneyInput name="estimatedAmount" defaultValue={request.estimatedAmount} />
        </Field>
        <Field label="Categoria">
          <Select name="category" defaultValue={request.category}>
            <option value="OUTROS">Outros</option>
            <option value="COMPRA_PECA">Compra de peças</option>
            <option value="DESPESA_OPERACIONAL">Despesa operacional</option>
            <option value="COMBUSTIVEL">Combustível</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vencimento (1º, opcional)">
          <Input name="dueDate" type="date" defaultValue={request.dueDate ? toDateInputValue(new Date(request.dueDate)) : ""} />
        </Field>
        <Field label="Nº da NF / documento (opcional)">
          <Input name="documentNumber" defaultValue={request.documentNumber || ""} placeholder="Ex: NF 12345" />
        </Field>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="paymentMode"
            value="PARCELADO"
            checked={parcelado}
            onChange={(e) => setParcelado(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Pagamento parcelado
        </label>
        {parcelado ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nº de parcelas">
              <Input name="installmentsCount" type="number" min={2} defaultValue={Math.max(2, request.installmentsCount)} />
            </Field>
            <Field label="Período">
              <Select name="installmentPeriod" defaultValue={request.installmentPeriod || "MENSAL"}>
                <option value="MENSAL">Mensal</option>
                <option value="DIAS">A cada X dias</option>
              </Select>
            </Field>
            <Field label="Dias (se por dias)">
              <Input name="installmentDays" type="number" min={1} defaultValue={request.installmentDays} />
            </Field>
          </div>
        ) : null}
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
          <Select name="vehicleId" defaultValue={request.vehicleId || ""}>
            <option value="">Nenhum (custo geral de veículos)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {flow === "CAPITAL" ? (
        <Field label="Beneficiário do capital">
          <Select name="capitalBeneficiaryId" defaultValue={request.capitalBeneficiaryId || ""}>
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
        defaultValue={request.supplierId || ""}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
