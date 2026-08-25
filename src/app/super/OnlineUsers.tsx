"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";

export type OnlineRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  profileName: string | null;
  /** ISO — a hora do último batimento visto pelo servidor. */
  lastSeenAt: string;
};

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
};

/** "agora", "há 40 s", "há 3 min" — o quanto faz do último sinal de vida. */
function desde(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 20) return "agora";
  if (s < 60) return `há ${s} s`;
  return `há ${Math.round(s / 60)} min`;
}

/**
 * Quem está com o sistema aberto. O relógio anda no navegador (o "há X" não
 * congela) e a página é recarregada a cada 30 s para trazer quem entrou ou
 * saiu — o batimento no servidor é a cada 10 s.
 */
export default function OnlineUsers({ users, eu }: { users: OnlineRow[]; eu: string | null }) {
  const router = useRouter();
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setAgora(Date.now()), 15_000);
    const refresh = setInterval(() => router.refresh(), 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  if (users.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Ninguém com o sistema aberto neste momento.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {users.map((u) => (
        <li
          key={u.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium text-slate-800">
              <span
                aria-hidden
                className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle"
              />
              {u.name}
              {eu === u.id ? (
                <span className="ml-2 text-xs font-normal text-slate-500">(você)</span>
              ) : null}
            </p>
            <p className="truncate text-xs text-slate-500">
              {u.email} · {u.profileName || roleLabel[u.role] || u.role}
            </p>
          </div>
          <Badge tone="success">{desde(u.lastSeenAt, agora)}</Badge>
        </li>
      ))}
    </ul>
  );
}
