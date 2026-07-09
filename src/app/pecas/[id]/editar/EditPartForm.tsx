"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { updatePartAction, type FormState } from "../../actions";

type Supplier = { id: string; name: string };
type Part = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  minQuantity: number;
  costPrice: number;
  salePrice: number;
  supplierId: string | null;
};

export default function EditPartForm({ part, suppliers }: { part: Part; suppliers: Supplier[] }) {
  const [state, formAction, pending] = useActionState(updatePartAction, {} as FormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" defaultValue={part.id} />
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Código" required>
          <Input name="code" defaultValue={part.code} required />
        </Field>
        <Field label="Nome" required>
          <Input name="name" defaultValue={part.name} required />
        </Field>
        <Field label="Estoque mínimo">
          <Input type="number" min={0} name="minQuantity" defaultValue={part.minQuantity} />
        </Field>
        <Field label="Fornecedor">
          <Select name="supplierId" defaultValue={part.supplierId || ""}>
            <option value="">Sem fornecedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preço de custo" required>
          <Input type="number" step="0.01" min={0} name="costPrice" defaultValue={part.costPrice} required />
        </Field>
        <Field label="Preço de venda" required>
          <Input type="number" step="0.01" min={0} name="salePrice" defaultValue={part.salePrice} required />
        </Field>
      </div>
      <Field label="Descrição">
        <Textarea name="description" defaultValue={part.description || ""} rows={2} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
