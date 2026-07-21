"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleSystemLockAction } from "@/app/sistema/actions";

/**
 * Bloqueio do sistema (modo manutenção, estilo Agrasty):
 * - todos os clientes consultam /api/system-lock a cada 10 s;
 * - admin bloqueado: faixa vermelha fixa no topo com atalho para desbloquear;
 * - demais usuários: overlay cobrindo toda a tela;
 * - ao desbloquear, quem estava sob o overlay recarrega automaticamente
 *   (garante voltar já na versão nova após um deploy).
 */
export default function SystemLockWatcher({
  initialLocked,
  isAdmin,
}: {
  initialLocked: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [locked, setLocked] = useState(initialLocked);
  const prevLocked = useRef(initialLocked);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const r = await fetch("/api/system-lock", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { locked: boolean };
        setLocked(data.locked);
      } catch {
        // rede indisponível: mantém o último estado conhecido
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Desbloqueou enquanto o usuário estava sob o overlay → recarrega.
    if (prevLocked.current === true && locked === false && !isAdmin) {
      window.location.reload();
    }
    prevLocked.current = locked;
  }, [locked, isAdmin]);

  function unlock() {
    setMsg(null);
    startTransition(async () => {
      const r = await toggleSystemLockAction(false);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível desbloquear.");
        return;
      }
      setLocked(false);
      setMsg("Sistema desbloqueado");
      router.refresh();
    });
  }

  if (!locked) return null;

  if (isAdmin) {
    return (
      <div className="fixed inset-x-0 top-0 z-[90] flex flex-wrap items-center justify-center gap-3 bg-rose-600 px-4 py-2 text-center text-sm font-semibold text-white">
        🔒 Sistema BLOQUEADO — apenas administradores têm acesso
        <button
          type="button"
          onClick={unlock}
          disabled={pending}
          className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 disabled:opacity-60"
        >
          {pending ? "Desbloqueando..." : "Desbloquear"}
        </button>
        {msg ? <span className="text-xs font-normal">{msg}</span> : null}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 px-6">
      <div className="max-w-md text-center text-white">
        <p className="text-5xl">🔧</p>
        <h1 className="mt-4 text-2xl font-bold">Sistema em manutenção</h1>
        <p className="mt-3 text-slate-300">
          Este sistema encontra-se em manutenção. Aguarde a liberação pelo administrador.
        </p>
        <p className="mt-6 text-xs text-slate-500">
          Esta tela é liberada automaticamente assim que a manutenção terminar.
        </p>
      </div>
    </div>
  );
}
