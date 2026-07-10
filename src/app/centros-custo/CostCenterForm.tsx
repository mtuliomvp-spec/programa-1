"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createCostCenterAction, type CentroCustoFormState } from "./actions";

export default function CostCenterForm() {
  const [state, formAction, pending] = useActionState(
    createCostCenterAction,
    {} as CentroCustoFormState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome" required>
        <Input name="name" required placeholder="Ex: Obra galpão novo" />
      </Field>
      <Field label="Tipo" required>
        <Select name="type" defaultValue="OBRA">
          <option value="OBRA">Obra</option>
          <option value="IMOVEL">Imóvel</option>
          <option value="OUTRO">Outro</option>
        </Select>
      </Field>
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar centro de custo"}
      </Button>
    </form>
  );
}
