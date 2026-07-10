"use client";

import { logoutAction } from "@/app/login/actions";
import clsx from "@/lib/clsx";

export default function UserFooter({
  user,
  dark = false,
}: {
  user: { name: string; role: "ADMIN" | "OPERADOR" };
  dark?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 leading-tight">
        <p className={clsx("truncate text-sm font-medium", dark ? "text-white" : "text-slate-900")}>
          {user.name}
        </p>
        <p className={clsx("text-[11px]", dark ? "text-slate-400" : "text-slate-500")}>
          {user.role === "ADMIN" ? "Administrador" : "Operador"}
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
  );
}
