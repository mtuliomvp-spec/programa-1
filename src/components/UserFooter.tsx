"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { toggleSystemLockAction } from "@/app/sistema/actions";
import clsx from "@/lib/clsx";

export default function UserFooter({
  user,
  roleLabel,
  dark = false,
  systemLocked = false,
}: {
  user: { name: string; role: "ADMIN" | "OPERADOR" | "SUPER_ADMIN" };
  roleLabel?: string;
  dark?: boolean;
  systemLocked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label =
    roleLabel ??
    (user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ADMIN" ? "Administrador" : "Operador");

  function toggleLock() {
    const question = systemLocked
      ? "Desbloquear o sistema? Todos os usuários voltam a ter acesso."
      : "Bloquear o sistema para manutenção? Apenas administradores continuarão navegando; os demais verão o aviso de manutenção.";
    if (!window.confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const r = await toggleSystemLockAction(!systemLocked);
      if (!r.ok) {
        setError(r.error || "Não foi possível alterar o bloqueio.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {/* Bloquear/desbloquear é do dono do sistema — some para a loja. */}
      {user.role === "SUPER_ADMIN" ? (
        <button
          type="button"
          onClick={toggleLock}
          disabled={pending}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60",
            systemLocked
              ? "bg-rose-600 text-white hover:bg-rose-500"
              : dark
                ? "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          {pending
            ? "Aguarde..."
            : systemLocked
              ? "🔓 Desbloquear Sistema"
              : "🔒 Bloquear Sistema"}
        </button>
      ) : null}
      {error ? (
        <p className={clsx("text-[11px]", dark ? "text-rose-300" : "text-rose-600")}>{error}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 leading-tight">
          <p className={clsx("truncate text-sm font-medium", dark ? "text-white" : "text-slate-900")}>
            {user.name}
          </p>
          <p className={clsx("text-[11px]", dark ? "text-slate-400" : "text-slate-500")}>
            {label}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className={clsx(
              "rounded-lg px-2.5 py-1.5 text-xs font-medium",
              dark
                ? "text-slate-300 hover:bg-white/10 hover:text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
