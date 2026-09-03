"use client";

import { useState } from "react";
import { barcodeDigits, formatBarcodeLine } from "@/lib/barcode-line";

/**
 * Linha digitável do boleto/fatura na Ordem de Pagamento, pronta para copiar e
 * colar no leitor do banco. Copia SÓ OS DÍGITOS (é o que o aplicativo do banco
 * aceita); o que aparece na tela fica formatado para conferência.
 */
export default function CopyBarcode({ value }: { value: string }) {
  const [copiado, setCopiado] = useState(false);
  const digitos = barcodeDigits(value);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(digitos);
    } catch {
      // Navegador sem permissão de área de transferência: seleciona o texto
      // para o usuário copiar à mão (Ctrl+C / segurar e copiar).
      const el = document.getElementById("linha-digitavel");
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
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Linha digitável
        </span>
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 print:hidden"
        >
          {copiado ? "✓ Copiado" : "📋 Copiar"}
        </button>
      </div>
      <p id="linha-digitavel" className="mt-1 break-all font-mono text-sm text-slate-900">
        {formatBarcodeLine(value)}
      </p>
      <p className="mt-1 text-xs text-slate-500 print:hidden">
        Copia só os números — cole no “pagar com código de barras” do aplicativo do banco.
      </p>
    </div>
  );
}
