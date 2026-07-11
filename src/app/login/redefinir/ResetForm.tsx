"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { resetWithTokenAction, type SignupFormState } from "../actions";

export default function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetWithTokenAction,
    {} as SignupFormState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <Field label="Nova senha (mín. 6 caracteres)" required>
        <Input name="password" type="password" required minLength={6} autoFocus />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Salvar nova senha e entrar"}
      </Button>
    </form>
  );
}
