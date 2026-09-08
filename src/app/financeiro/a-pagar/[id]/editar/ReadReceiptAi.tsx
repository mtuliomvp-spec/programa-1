"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { readPayableReceiptAction, type ReadReceiptResult } from "../../actions";

/** yyyy-mm-dd (do comprovante) → dd/mm/aaaa, sem passar pelo fuso do navegador. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Lê o COMPROVANTE do pagamento: confere valor, data e a CONTA DEBITADA com o
 * título e põe o pagamento na fila de espera do caixa. Quando o movimento do
 * dia do pagamento for aberto, ele aparece pré-lançado em "Contas e caixas",
 * esperando só um ok para debitar de verdade.
 */
export default function ReadReceiptAi({
  payableId,
  amountAtual,
  cashboxDate,
}: {
  payableId: string;
  amountAtual: number;
  /** Data do caixa aberto, para o aviso dizer se vai esperar ou já dá para dar o ok. */
  cashboxDate: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReadReceiptResult | null>(null);

  async function handleRead() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setResult(null);
    setBusy(true);
    try {
      const prepared = await resizeImageToJpeg(file);
      const fd = new FormData();
      fd.set("payableId", payableId);
      fd.set("file", prepared);
      const res = await readPayableReceiptAction(fd);
      setResult(res);
      if (res.attached) router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const esperandoCaixa =
    result?.enfileirado && result.data && cashboxDate && dataBr(result.data) !== formatDate(cashboxDate);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">🧾 Conferir o comprovante e pré-lançar</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Anexe o comprovante do banco: a IA lê valor, data e a <strong>conta debitada</strong>, confere
        com este título e deixa o pagamento na fila do caixa. Quando o movimento do dia do pagamento
        for aberto, ele aparece pré-lançado em Contas e caixas esperando só um ok para debitar.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        />
        <Button type="button" onClick={handleRead} disabled={busy}>
          {busy ? "Lendo o comprovante…" : "Ler e conferir"}
        </Button>
      </div>
      {busy ? (
        <p className="mt-2 text-xs text-slate-500">
          A IA está lendo o comprovante — costuma levar alguns segundos. Não feche a página.
        </p>
      ) : null}

      {result?.error ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ {result.error}
        </p>
      ) : null}

      {result?.ok && result.enfileirado ? (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">
            ✓ {result.valor != null ? formatCurrency(result.valor) : "valor"} pago em{" "}
            {result.data ? dataBr(result.data) : "—"}
            {result.accountName ? ` · debitado em ${result.accountName}` : ""}
          </p>
          {result.contaLida && !result.accountName ? (
            <p className="mt-0.5 text-xs text-slate-500">Conta no comprovante: {result.contaLida}</p>
          ) : null}
          {result.beneficiario ? (
            <p className="mt-0.5 text-xs text-slate-500">Pago a: {result.beneficiario}</p>
          ) : null}
          {result.valor != null && Math.abs(result.valor - amountAtual) > 0.005 ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              ⚠ O título está em {formatCurrency(amountAtual)} — a baixa vai sair pelo valor do
              comprovante, que é o que saiu do banco.
            </p>
          ) : null}
          {result.avisos?.length ? (
            <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
              {result.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-slate-600">
            {esperandoCaixa
              ? `Na fila de espera: o caixa está em ${formatDate(cashboxDate!)}. Ao abrir o movimento de ${dataBr(result.data!)}, o pagamento aparece pré-lançado em Contas e caixas.`
              : "Pré-lançado: confirme em Contas e caixas para debitar da conta."}
          </p>
        </div>
      ) : null}

      {result?.ok && result.enfileirado === false ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Comprovante anexado. Este título já está pago — não há o que pré-lançar.
        </p>
      ) : null}
    </div>
  );
}
