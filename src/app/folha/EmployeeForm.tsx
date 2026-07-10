"use client";

import { useActionState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { createEmployeeAction, type FolhaFormState } from "./actions";
import { toDateInputValue } from "@/lib/format";

export default function EmployeeForm() {
  const [state, formAction, pending] = useActionState(createEmployeeAction, {} as FolhaFormState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome" required>
        <Input name="name" required placeholder="Ex: Marcos Silva" />
      </Field>
      <Field label="Cargo">
        <Input name="role" placeholder="Ex: Vendedor" />
      </Field>
      <Field label="CPF">
        <Input name="cpf" placeholder="000.000.000-00" />
      </Field>
      <Field label="Chave PIX">
        <Input name="pixKey" placeholder="CPF, e-mail ou telefone" />
      </Field>
      <Field label="Salário mensal (R$)" required>
        <Input name="salary" type="number" step="0.01" min={0} required />
      </Field>
      <Field label="Data de admissão" required>
        <Input name="admissionDate" type="date" defaultValue={toDateInputValue(new Date())} required />
      </Field>
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar funcionário"}
      </Button>
    </form>
  );
}
