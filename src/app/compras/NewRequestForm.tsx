"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createRequestAction, type ComprasFormState } from "./actions";

type Option = { id: string; name: string };

export default function NewRequestForm({ suppliers }: { suppliers: Option[] }) {
  const [state, formAction, pending] = useActionState(createRequestAction, {} as ComprasFormState);

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
      <Field label="Fornecedor sugerido">
        <Select name="supplierId" defaultValue="">
          <option value="">Sem sugestão</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enviando..." : "Solicitar compra"}
      </Button>
    </form>
  );
}
