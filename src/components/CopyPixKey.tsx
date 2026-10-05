"use client";

import { useRef, useState } from "react";

/**
 * Chave PIX do favorecido, pronta para copiar e colar no aplicativo do banco
 * (mesmo bloco da linha digitável). CPF, CNPJ e telefone vão SÓ COM OS
 * NÚMEROS — é o que o campo da chave aceita; e-mail e chave aleatória vão como
 * estão. Sem o tipo cadastrado, decide pelo formato da própria chave.
 */
export function pixKeyParaCopiar(chave: string, tipo?: string | null): string {
  const limpa = chave.trim();
  if (tipo === "email" || tipo === "aleatoria") return limpa;
  if (tipo === "cpf" || tipo === "cnpj" || tipo === "telefone") return limpa.replace(/\D/g, "");
  // Sem tipo: só números e pontuação (CPF, CNPJ, telefone) → só os dígitos.
  return /^[\d\s().+/-]+$/.test(limpa) ? limpa.replace(/\D/g, "") : limpa;
}

export default function CopyPixKey({
  value,
  label = "Chave PIX",
  tipo,
}: {
  value: string;
  label?: string;
  tipo?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const chaveRef = useRef<HTMLParagraphElement>(null);
  const texto = pixKeyParaCopiar(value, tipo);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Navegador sem permissão de área de transferência: seleciona o texto
      // para o usuário copiar à mão (Ctrl+C / segurar e copiar).
      const el = chaveRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 print:hidden"
        >
          {copiado ? "✓ Copiado" : "📋 Copiar"}
        </button>
      </div>
      <p ref={chaveRef} className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
        {value}
      </p>
      {texto !== value.trim() ? (
        <p className="mt-1 text-xs text-slate-500 print:hidden">
          Copia só os números ({texto}) — cole no “pagar com PIX” do aplicativo do banco.
        </p>
      ) : null}
    </div>
  );
}
