"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { createRequestAction, type ComprasFormState } from "./actions";

type Option = { id: string; name: string };
type Vehicle = { id: string; label: string };

export default function NewRequestForm({
  suppliers,
  vehicles,
  beneficiaries,
}: {
  suppliers: Option[];
  vehicles: Vehicle[];
  beneficiaries: Option[];
}) {
  const [state, formAction, pending] = useActionState(createRequestAction, {} as ComprasFormState);
  const [flow, setFlow] = useState("ADMINISTRATIVO");

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <Field label="O que comprar" required>
        <Input name="description" required placeholder="Ex: 4 pneus aro 15" />
      </Field>
      <Field label="Detalhes / justificativa">
        <Textarea name="details" rows={3} placeholder="Marca, especificação, para qual veículo..." />
      </Field>
      <Field label="Valor estimado (R$)">
        <Input name="estimatedAmount" type="number" step="0.01" min={0} />
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
        </Field>
      ) : null}

      {flow === "CAPITAL" ? (
        <Field label="Beneficiário do capital">
          <Select name="capitalBeneficiaryId" defaultValue="">
            <option value="">Selecione o beneficiário</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SupplierSelect suppliers={suppliers} label="Fornecedor sugerido" emptyLabel="Sem sugestão" />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enviando..." : "Solicitar compra"}
      </Button>
    </form>
  );
}
