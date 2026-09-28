"use client";

import { useState } from "react";

/**
 * Copiar / enviar os dados bancários da conta (para receber um pagamento).
 *
 * O texto já vem pronto do servidor. Três saídas: copiar (para colar onde
 * quiser), abrir o WhatsApp com a mensagem preenchida e, no celular, o menu de
 * compartilhar do aparelho (Telegram, e-mail, SMS...).
 */
export default function ShareBankDataButton({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const podeCompartilhar = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sem permissão de área de transferência (navegador antigo / app):
      // o caminho clássico com um campo temporário selecionado.
      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      document.body.removeChild(campo);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  async function compartilhar() {
    try {
      await navigator.share({ text: texto });
    } catch {
      // Cancelado pelo usuário: nada a fazer.
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-1 text-xs font-medium text-blue-700 hover:underline"
      >
        📋 Dados bancários
      </button>
    );
  }

  return (
    <div className="mt-2 max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-3">
      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">{texto}</pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copiar}
          className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
        >
          {copiado ? "✓ Copiado" : "Copiar"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          WhatsApp
        </a>
        {podeCompartilhar ? (
          <button
            type="button"
            onClick={compartilhar}
            className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Compartilhar
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-xs text-slate-400 hover:underline"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
