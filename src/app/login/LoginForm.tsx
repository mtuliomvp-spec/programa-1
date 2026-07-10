"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { loginAction, setupAdminAction, type LoginFormState } from "./actions";

export default function LoginForm({ isSetup, next }: { isSetup: boolean; next?: string }) {
  const action = isSetup ? setupAdminAction : loginAction;
  const [state, formAction, pending] = useActionState(action, {} as LoginFormState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {isSetup ? (
        <Field label="Seu nome" required>
          <Input name="name" required placeholder="Ex: Marcelo" autoFocus />
        </Field>
      ) : null}
      <Field label="E-mail" required>
        <Input name="email" type="email" required placeholder="voce@email.com" autoFocus={!isSetup} />
      </Field>
      <Field label={isSetup ? "Crie uma senha (mín. 6 caracteres)" : "Senha"} required>
        <Input name="password" type="password" required minLength={isSetup ? 6 : undefined} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Entrando..." : isSetup ? "Criar e entrar" : "Entrar"}
      </Button>
    </form>
  );
}
