"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";

export type PersonFormState = { error?: string };

type PersonData = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export default function PersonForm({
  action,
  person,
  documentLabel = "CPF / CNPJ",
}: {
  action: (state: PersonFormState, formData: FormData) => Promise<PersonFormState>;
  person?: PersonData;
  documentLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {person ? <input type="hidden" name="id" defaultValue={person.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" required>
          <Input name="name" defaultValue={person?.name} required />
        </Field>
        <Field label={documentLabel}>
          <Input name="document" defaultValue={person?.document || ""} />
        </Field>
        <Field label="Telefone">
          <Input name="phone" defaultValue={person?.phone || ""} />
        </Field>
        <Field label="E-mail">
          <Input type="email" name="email" defaultValue={person?.email || ""} />
        </Field>
        <Field label="Endereço" >
          <Input name="address" defaultValue={person?.address || ""} className="sm:col-span-2" />
        </Field>
      </div>
      <Field label="Observações">
        <Textarea name="notes" defaultValue={person?.notes || ""} rows={3} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : person ? "Salvar alterações" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
