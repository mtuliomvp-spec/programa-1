"use client";

import { useEffect } from "react";

/**
 * Overlay de "processando" em tela cheia. Aparece no instante em que uma ação
 * demorada começa (registrar venda, excluir), dando um retorno inconfundível de
 * que o comando foi recebido — e bloqueia toques repetidos até concluir.
 */
export default function ProcessingOverlay({
  show,
  label = "Registrando a venda… aguarde. Não feche esta página.",
}: {
  show: boolean;
  label?: string;
}) {
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-slate-900/70 px-6 text-center backdrop-blur-sm print:hidden"
      role="status"
      aria-live="assertive"
    >
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      <p className="max-w-xs text-base font-semibold text-white">{label}</p>
    </div>
  );
}
