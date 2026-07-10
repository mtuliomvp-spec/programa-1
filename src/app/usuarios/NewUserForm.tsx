"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createUserAction, type UserFormState } from "./actions";

export default function NewUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, {} as UserFormState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <Field label="Nome" required>
        <Input name="name" required />
      </Field>
      <Field label="E-mail" required>
        <Input name="email" type="email" required />
      </Field>
      <Field label="Senha (mín. 6 caracteres)" required>
        <Input name="password" type="password" minLength={6} required />
      </Field>
      <Field label="Perfil" required>
        <Select name="role" defaultValue="OPERADOR">
          <option value="OPERADOR">Operador (usa o sistema)</option>
          <option value="ADMIN">Administrador (gerencia usuários)</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar usuário"}
      </Button>
    </form>
  );
}
