"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  applyBoletoToPayableAction,
  readPayableBoletoAction,
  type ReadBoletoResult,
} from "../../actions";

/** yyyy-mm-dd (do boleto) → dd/mm/aaaa, sem passar pelo fuso do navegador. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Lê o boleto do título com a IA: anexa o arquivo no slot Boleto e devolve
 * valor e vencimento para o usuário conferir antes de aplicar. Um arquivo pode
 * trazer VÁRIOS boletos (o carnê de impostos vem com DAS, FGTS e INSS juntos),
 * por isso cada um vem com o seu próprio botão — o usuário escolhe o que é
 * deste título e leva os outros nos títulos deles.
 */
export default function ReadBoletoAi({
  payableId,
  amountAtual,
  dueDateAtual,
}: {
  payableId: string;
  amountAtual: number;
  dueDateAtual: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReadBoletoResult | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, startApply] = useTransition();

  async function handleRead() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setResult(null);
    setApplied(null);
    setApplyError(null);
    setBusy(true);
    try {
      const prepared = await resizeImageToJpeg(file);
      const fd = new FormData();
      fd.set("payableId", payableId);
      fd.set("file", prepared);
      const res = await readPayableBoletoAction(fd);
      setResult(res);
      // O anexo já entrou mesmo quando a leitura falha — atualiza o slot.
      if (res.attached) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function aplicar(amount: number | null, dueDate: string | null) {
    setApplyError(null);
    startApply(async () => {
      const res = await applyBoletoToPayableAction({ payableId, amount, dueDate });
      if (!res.ok) {
        setApplyError(res.error || "Não foi possível aplicar.");
        return;
      }
      const partes = [
        amount != null ? `valor ${formatCurrency(amount)}` : null,
        dueDate ? `vencimento ${dataBr(dueDate)}` : null,
      ].filter(Boolean);
      setApplied(`Aplicado ao título: ${partes.join(" · ")}.`);
      // O formulário acima guarda o valor em estado próprio (máscara de moeda):
      // só um recarregamento garante que ele apareça atualizado na tela.
      setTimeout(() => window.location.reload(), 900);
    });
  }

  return (
    <div className="mb-1 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">🤖 Ler o boleto com IA</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Anexe o boleto (PDF ou foto) e a IA lê o valor e o vencimento para você conferir — o arquivo
        já fica guardado no slot do boleto. Serve para o plano de saúde, as guias de imposto e
        qualquer outro boleto que chegue.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        />
        <Button type="button" onClick={handleRead} disabled={busy || applying}>
          {busy ? "Lendo o boleto…" : "Ler e anexar"}
        </Button>
      </div>
      {busy ? (
        <p className="mt-2 text-xs text-slate-500">
          A IA está lendo o documento — costuma levar alguns segundos. Não feche a página.
        </p>
      ) : null}

      {result?.error ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ {result.error}
        </p>
      ) : null}

      {result && result.boletos.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">
            Hoje o título está em <strong>{formatCurrency(amountAtual)}</strong>, vencendo em{" "}
            <strong>{formatDate(dueDateAtual)}</strong>.
            {result.boletos.length > 1
              ? ` O arquivo tem ${result.boletos.length} boletos — aplique o que é deste título.`
              : ""}
          </p>
          {result.boletos.map((b, i) => {
            const podeValor = b.amount != null && !result.amountLocked;
            const podeVenc = Boolean(b.dueDate) && !result.dueDateLocked;
            const mudaValor = b.amount != null && Math.abs(b.amount - amountAtual) > 0.005;
            return (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-800">
                  {b.amount != null ? formatCurrency(b.amount) : "valor não lido"}
                  {b.dueDate ? ` · vence em ${dataBr(b.dueDate)}` : ""}
                </p>
                {b.descricao || b.cedente ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[b.descricao, b.cedente].filter(Boolean).join(" — ")}
                  </p>
                ) : null}
                {podeValor && !mudaValor ? (
                  <p className="mt-1 text-xs text-emerald-700">✓ Bate com o valor do título.</p>
                ) : null}
                {podeValor || podeVenc ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={applying}
                      onClick={() => aplicar(podeValor ? b.amount : null, podeVenc ? b.dueDate : null)}
                    >
                      {applying ? "Aplicando…" : "Aplicar a este título"}
                    </Button>
                  </div>
                ) : null}
                {result.amountLocked ? (
                  <p className="mt-1 text-xs text-slate-500">🔒 {result.amountLocked}</p>
                ) : null}
                {result.dueDateLocked && b.dueDate ? (
                  <p className="mt-1 text-xs text-slate-500">🔒 {result.dueDateLocked}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {applyError ? <p className="mt-2 text-sm font-medium text-rose-600">{applyError}</p> : null}
      {applied ? (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ {applied} Atualizando a tela…
        </p>
      ) : null}
    </div>
  );
}
