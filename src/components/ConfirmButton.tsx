"use client";

import { useState, type ReactNode } from "react";

/**
 * Botão que pergunta NA PRÓPRIA TELA antes de agir, sem `window.confirm`.
 *
 * O confirm nativo não é confiável no celular: em navegador dentro de aplicativo
 * e no atalho instalado na tela de início do iPhone ele simplesmente não abre —
 * o clique volta como "cancelar" e a ação nunca acontece. Para quem está no
 * balcão, o botão "não faz nada", e não há erro nenhum para mostrar.
 *
 * Aqui a pergunta é um bloco na tela: funciona em qualquer navegador, dá para
 * ler com calma e o "Voltar" é tão claro quanto o "Confirmar".
 */
export default function ConfirmButton({
  children,
  question,
  confirmLabel = "Confirmar",
  cancelLabel = "Voltar",
  onConfirm,
  disabled = false,
  className = "",
}: {
  /** Conteúdo do botão que abre a pergunta. */
  children: ReactNode;
  /** A pergunta, com o que vai acontecer ao confirmar. */
  question: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Classes do botão de abrir (o visual é de quem chama). */
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={disabled || aberto}
        className={className}
      >
        {children}
      </button>
      {aberto ? (
        // w-full: dentro de uma barra de botões (flex), a pergunta cai para a
        // linha de baixo em vez de espremer os botões.
        <div className="w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-left">
          <p className="text-sm text-slate-700">{question}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setAberto(false);
                onConfirm();
              }}
              className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAberto(false)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
