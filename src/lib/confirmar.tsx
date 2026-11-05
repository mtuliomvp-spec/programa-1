"use client";

import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";

/**
 * `confirm()` que funciona em qualquer navegador: `await perguntar("…")`.
 *
 * O `window.confirm` nativo NÃO abre no navegador dentro de aplicativo (link
 * aberto pelo WhatsApp, e-mail, Claude — o Safari com a bússola embaixo) nem no
 * atalho da tela de início do iPhone: volta direto como "cancelar", e o botão
 * (Excluir, tirar da fila…) parece não fazer nada, sem erro nenhum.
 *
 * Aqui a pergunta é uma janela da própria página, desenhada na hora e
 * removida ao responder. Mesmo texto, mesma resposta (true = confirmou).
 */
export function perguntar(
  pergunta: string,
  opcoes: { confirmar?: string; cancelar?: string; perigo?: boolean } = {},
): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const responder = (sim: boolean) => {
      root.unmount();
      host.remove();
      resolve(sim);
    };
    root.render(<Janela pergunta={pergunta} opcoes={opcoes} responder={responder} />);
  });
}

function Janela({
  pergunta,
  opcoes,
  responder,
}: {
  pergunta: string;
  opcoes: { confirmar?: string; cancelar?: string; perigo?: boolean };
  responder: (sim: boolean) => void;
}) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") responder(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [responder]);
  const perigo = opcoes.perigo ?? /exclu|apag|remov|cancel|desfaz|revert|estorn|tirar/i.test(pergunta);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => responder(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="whitespace-pre-line text-sm text-slate-800">{pergunta}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => responder(false)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {opcoes.cancelar ?? "Voltar"}
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={() => responder(true)}
            className={`h-10 rounded-lg px-4 text-sm font-semibold text-white ${
              perigo ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-700"
            }`}
          >
            {opcoes.confirmar ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
