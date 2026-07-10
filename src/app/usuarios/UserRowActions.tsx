"use client";

import { useState, useTransition, useActionState } from "react";
import {
  toggleUserAction,
  resetPasswordAction,
  updatePermissionsAction,
  type UserFormState,
} from "./actions";
import { Button, Input } from "@/components/ui";
import PermissionsChecklist from "./PermissionsChecklist";

export default function UserRowActions({
  id,
  active,
  isSelf,
  role,
  permissions,
}: {
  id: string;
  active: boolean;
  isSelf: boolean;
  role: "ADMIN" | "OPERADOR";
  permissions: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [showReset, setShowReset] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [permsState, permsAction, permsPending] = useActionState(
    async (prev: UserFormState, formData: FormData) => {
      const result = await updatePermissionsAction(prev, formData);
      if (result.success) setShowPerms(false);
      return result;
    },
    {} as UserFormState,
  );
  const [state, formAction, resetPending] = useActionState(
    async (prev: UserFormState, formData: FormData) => {
      const result = await resetPasswordAction(prev, formData);
      if (result.success) setShowReset(false);
      return result;
    },
    {} as UserFormState,
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 text-sm font-medium">
        {role === "OPERADOR" ? (
          <button
            type="button"
            onClick={() => setShowPerms((v) => !v)}
            className="text-blue-700 hover:underline"
          >
            Permissões
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowReset((v) => !v)}
          className="text-blue-700 hover:underline"
        >
          Trocar senha
        </button>
        {!isSelf ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const message = active
                ? "Desativar este usuário? Ele perde o acesso imediatamente."
                : "Reativar este usuário?";
              if (confirm(message)) startTransition(() => toggleUserAction(id, !active));
            }}
            className={`hover:underline disabled:opacity-50 ${active ? "text-rose-600" : "text-emerald-700"}`}
          >
            {active ? "Desativar" : "Reativar"}
          </button>
        ) : null}
      </div>
      {showReset ? (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={id} />
          <Input name="password" type="password" placeholder="Nova senha" minLength={6} required className="h-8 w-36 text-xs" />
          <Button type="submit" disabled={resetPending} className="h-8 px-2.5 text-xs">
            OK
          </Button>
        </form>
      ) : null}
      {state.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
      {showPerms ? (
        <form action={permsAction} className="w-64 space-y-2 text-left">
          <input type="hidden" name="userId" value={id} />
          <PermissionsChecklist defaults={permissions} />
          <Button type="submit" disabled={permsPending} className="h-8 w-full px-2.5 text-xs">
            {permsPending ? "Salvando..." : "Salvar permissões"}
          </Button>
        </form>
      ) : null}
      {permsState.error ? <p className="text-xs text-rose-600">{permsState.error}</p> : null}
    </div>
  );
}
