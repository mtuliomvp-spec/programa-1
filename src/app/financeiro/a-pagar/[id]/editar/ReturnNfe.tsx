"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { applyReturnNfeAction, type DevolucaoResult } from "../../actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Abate uma NF de DEVOLUÇÃO do título: anexa o DANFE da devolução e o valor
 * da mercadoria devolvida sai da ordem de pagamento. A leitura é
 * determinística (chave + valor + natureza vêm do texto do PDF, sem IA) e as
 * conferências — é devolução? é do fornecedor certo? cabe no título? já foi
 * abatida? — acontecem no servidor antes de mexer no valor.
 */
export default function ReturnNfe({ payableId }: { payableId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DevolucaoResult | null>(null);

  async function abater() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setRes(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("payableId", payableId);
      fd.set("file", file);
      const r = await applyReturnNfeAction(fd);
      setRes(r);
      if (r.ok) {
        if (fileRef.current) fileRef.current.value = "";
        // O valor do formulário acima é estado próprio (máscara): recarrega
        // para a tela inteira refletir o título abatido.
        setTimeout(() => window.location.reload(), 1800);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-1 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">↩️ Devolveu mercadoria ao fornecedor?</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Anexe o PDF da NF de devolução e o valor devolvido é abatido desta ordem de pagamento. A
        nota fica anexada ao título como comprovante.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        />
        <Button type="button" variant="secondary" onClick={abater} disabled={busy}>
          {busy ? "Lendo a nota…" : "Abater devolução"}
        </Button>
      </div>
      {res?.error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {res.error}
        </p>
      ) : null}
      {res?.ok ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ NF de devolução nº {res.nfNumero} abatida: {brl(res.valor ?? 0)} a menos. A ordem passou
          de {brl(res.valorAntes ?? 0)} para <strong>{brl(res.valorDepois ?? 0)}</strong>.
          Atualizando a tela…
        </p>
      ) : null}
    </div>
  );
}
