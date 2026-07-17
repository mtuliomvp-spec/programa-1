"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import PermissionsChecklist from "../PermissionsChecklist";
import { createProfileAction, updateProfileAction, type ProfileFormState } from "./actions";

type Profile = { id: string; name: string; permissions: string[] };

export default function ProfileForm({ profile }: { profile?: Profile }) {
  const action = profile ? updateProfileAction : createProfileAction;
  const [state, formAction, pending] = useActionState(action, {} as ProfileFormState);

  return (
    <form action={formAction} className="space-y-3">
      {profile ? <input type="hidden" name="id" value={profile.id} /> : null}
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome do perfil" required>
        <Input name="name" defaultValue={profile?.name || ""} placeholder="Ex.: Vendedor, Financeiro" required />
      </Field>
      <Field label="O que este perfil pode acessar">
        {/* Novo perfil começa em branco (defaults=[]); ao editar, usa as do perfil. */}
        <PermissionsChecklist defaults={profile?.permissions ?? []} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : profile ? "Salvar perfil" : "Criar perfil"}
      </Button>
    </form>
  );
}
