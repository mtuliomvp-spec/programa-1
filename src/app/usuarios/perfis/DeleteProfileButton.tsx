"use client";

import { useTransition } from "react";
import { deleteProfileAction } from "./actions";

export default function DeleteProfileButton({ id, name, usersCount }: { id: string; name: string; usersCount: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const msg =
          usersCount > 0
            ? `Excluir o perfil "${name}"? ${usersCount} usuário(s) ficarão sem perfil (mantêm as permissões atuais).`
            : `Excluir o perfil "${name}"?`;
        if (confirm(msg)) start(() => deleteProfileAction(id));
      }}
      className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
    >
      {pending ? "..." : "Excluir"}
    </button>
  );
}
