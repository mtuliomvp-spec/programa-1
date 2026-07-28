"use client";

import { useTransition } from "react";
import { setDefaultAccountAction, toggleAccountAction } from "./actions";

export default function AccountRowActions({
  id,
  active,
  isDefault,
  canManage = true,
}: {
  id: string;
  active: boolean;
  isDefault: boolean;
  canManage?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  return (
    <div className="flex flex-col items-end gap-1 text-sm font-medium">
      {active && !isDefault ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setDefaultAccountAction(id))}
          className="text-blue-700 hover:underline disabled:opacity-50"
        >
          Tornar padrão
        </button>
      ) : null}
      {!isDefault ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => toggleAccountAction(id, !active))}
          className={`hover:underline disabled:opacity-50 ${active ? "text-slate-500" : "text-emerald-700"}`}
        >
          {active ? "Desativar" : "Reativar"}
        </button>
      ) : null}
    </div>
  );
}
