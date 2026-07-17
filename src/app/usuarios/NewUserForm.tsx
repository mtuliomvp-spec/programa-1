"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createUserAction, type UserFormState } from "./actions";
import PermissionsChecklist from "./PermissionsChecklist";
import UserBankFields from "./UserBankFields";

export default function NewUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, {} as UserFormState);
  const [role, setRole] = useState("OPERADOR");

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
        <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="OPERADOR">Operador (usa o sistema)</option>
          <option value="ADMIN">Administrador (acessa tudo e gerencia usuários)</option>
        </Select>
      </Field>
      {role === "OPERADOR" ? (
        <Field label="O que este usuário pode acessar">
          <PermissionsChecklist />
        </Field>
      ) : null}
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          Dados para pagamento (comissão)
        </legend>
        <p className="mb-2 text-xs text-slate-500">Saem na Ordem de Pagamento da comissão deste vendedor.</p>
        <UserBankFields />
      </fieldset>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando..." : "Criar usuário"}
      </Button>
    </form>
  );
}
