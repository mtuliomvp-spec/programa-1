"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { importCardInvoicePdfAction, type ImportPdfResult } from "./card-actions";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Importa a fatura do cartão em PDF: a IA lê o arquivo, extrai os lançamentos
 * (IOF somado na linha, pagamentos ignorados), aplica as regras de fluxo do
 * Capital e preenche o título. Disponível enquanto o título estiver vazio —
 * depois da importação, cada linha pode ser revisada com Editar/Excluir.
 */
export default function ImportFaturaPdf({
  payableId,
  hasItems,
}: {
  payableId: string;
  hasItems: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ImportPdfResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (hasItems && !result) return null;

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">🤖 Importar a fatura (PDF) com IA</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Anexe o PDF da fatura e a IA digita os lançamentos para você — compras internacionais já
        com o IOF somado, cada lançamento no Capital do sócio certo (Lovable/Anthropic → Agrasty ·
        cartão 9792 → Marcelo · demais → Marco Túlio). O PDF fica anexado ao título. Depois é só
        revisar e ajustar o que precisar.
      </p>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const file = fileRef.current?.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("payableId", payableId);
          fd.set("file", file);
          setResult(null);
          start(async () => setResult(await importCardInvoicePdfAction(fd)));
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          required
          className="text-sm text-slate-600 file:mr-2 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Lendo a fatura..." : "Importar lançamentos"}
        </Button>
      </form>

      {pending ? (
        <p className="mt-2 text-xs text-slate-500">
          A IA está lendo a fatura — pode levar um ou dois minutos. Não feche a página.
        </p>
      ) : null}

      {result ? (
        result.ok ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              {result.itemsCreated} lançamento(s) importado(s) · total {fmt(result.total)}
              {Math.abs(result.total - result.faturaTotal) <= 0.01
                ? " (bate com o total da fatura ✓)"
                : ""}
              .
            </p>
            {result.warning ? <p className="mt-1 text-amber-700">⚠️ {result.warning}</p> : null}
            <p className="mt-1 text-emerald-700">
              Revise a lista abaixo — cada linha tem Editar/Excluir. O PDF ficou anexado ao título.
            </p>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {result.error}
          </p>
        )
      ) : null}
    </div>
  );
}
