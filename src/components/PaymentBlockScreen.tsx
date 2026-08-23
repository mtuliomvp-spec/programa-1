"use client";

import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";

/**
 * Tela de acesso suspenso por pendência financeira. Diferente da manutenção,
 * ela para TODO MUNDO da loja — inclusive o administrador. Só o Super Admin
 * (dono do sistema) continua entrando, e é ele quem libera.
 *
 * A tela consulta o servidor de tempos em tempos e recarrega sozinha assim que
 * o acesso for liberado, sem o usuário precisar fazer nada.
 */
export default function PaymentBlockScreen({
  message,
  contato,
}: {
  message: string;
  contato: { nome: string | null; telefone: string | null; email: string | null };
}) {
  const [checando, setChecando] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/system-lock", { cache: "no-store" });
        const data = (await res.json()) as { paymentBlocked?: boolean };
        if (data && data.paymentBlocked === false) window.location.reload();
      } catch {
        // sem rede: tenta de novo no próximo ciclo
      }
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  const whats = contato.telefone ? contato.telefone.replace(/\D/g, "") : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 text-xl font-bold text-white">Acesso suspenso</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{message}</p>

        {contato.nome || contato.telefone || contato.email ? (
          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Fale com o fornecedor do sistema
            </p>
            {contato.nome ? <p className="mt-2 font-semibold text-white">{contato.nome}</p> : null}
            {contato.telefone ? <p className="mt-1">{contato.telefone}</p> : null}
            {contato.email ? <p className="mt-1">{contato.email}</p> : null}
            {whats.length >= 10 ? (
              <a
                href={`https://wa.me/${whats.startsWith("55") ? whats : `55${whats}`}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Falar no WhatsApp
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={checando}
            onClick={() => {
              setChecando(true);
              window.location.reload();
            }}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            {checando ? "Verificando…" : "Já regularizei — verificar"}
          </button>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-slate-400 hover:text-slate-200">
              Sair
            </button>
          </form>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Seus dados continuam guardados e intactos. O acesso volta assim que a pendência for
          regularizada.
        </p>
      </div>
    </div>
  );
}
