"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { readPayableReceiptAction, type ReadReceiptResult } from "./actions";
import { readComboReceiptAction } from "@/app/financeiro/combos/actions";

/** Como o banco chama a operação, do jeito que se lê ("Pix", "TED"…). */
function formaLabel(forma: string): string {
  const v = forma.trim().toUpperCase();
  if (v === "PIX") return "Pix";
  if (v === "TED" || v === "DOC") return v;
  if (v === "TRANSFERENCIA") return "Transferência";
  if (v === "BOLETO") return "Boleto";
  return forma;
}

/** yyyy-mm-dd (do comprovante) → dd/mm/aaaa, sem passar pelo fuso do navegador. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Lê o COMPROVANTE do pagamento: confere valor, data e a CONTA DEBITADA com o
 * que está sendo pago e põe o pagamento na fila de espera do caixa. Quando o
 * movimento do dia do pagamento for aberto, ele aparece pré-lançado em
 * "Contas e caixas", esperando só um ok para debitar de verdade.
 *
 * Serve para o título avulso e para o COMBO (borderô), que é pago de uma vez
 * só: lá o comprovante vale por todos os títulos e a fila recebe uma linha só.
 */
export default function ReadReceiptAi({
  alvo,
  amountAtual,
  cashboxDate,
}: {
  /** O que está sendo pago: um título do Contas a pagar ou um combo inteiro. */
  alvo: { tipo: "titulo" | "combo"; id: string };
  amountAtual: number;
  /** Data do caixa aberto, para o aviso dizer se vai esperar ou já dá para dar o ok. */
  cashboxDate: string | null;
}) {
  const ehCombo = alvo.tipo === "combo";
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReadReceiptResult | null>(null);
  /** Senha de abertura do PDF, quando o banco protege o comprovante. */
  const [senha, setSenha] = useState("");

  async function handleRead() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setResult(null);
    setBusy(true);
    try {
      const prepared = await resizeImageToJpeg(file);
      const fd = new FormData();
      fd.set(ehCombo ? "comboId" : "payableId", alvo.id);
      fd.set("file", prepared);
      if (senha) fd.set("senha", senha);
      const res = ehCombo ? await readComboReceiptAction(fd) : await readPayableReceiptAction(fd);
      setResult(res);
      if (res.attached) router.refresh();
      // Faltando a senha, o arquivo TEM de continuar escolhido: é ele que será
      // reenviado junto da senha.
      if (!res.senhaNecessaria && fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  const esperandoCaixa =
    result?.enfileirado && result.data && cashboxDate && dataBr(result.data) !== formatDate(cashboxDate);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">🧾 Conferir o comprovante e pré-lançar</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Anexe o comprovante do banco — boleto, Pix, TED, DOC ou transferência: a IA lê valor, data e a{" "}
        <strong>conta debitada</strong>, confere com {ehCombo ? "o total do combo" : "este título"} e deixa o pagamento
        na fila do caixa. Quando o movimento do dia do pagamento for aberto, ele aparece pré-lançado
        em Contas e caixas esperando só um ok para debitar
        {ehCombo ? " todos os títulos do combo de uma vez" : ""}.
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

      {result?.senhaNecessaria ? (
        <div className="mt-2 rounded-lg border border-slate-300 bg-white p-3">
          <label className="block text-xs font-medium text-slate-600">
            Senha do documento
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Ex.: CPF/CNPJ do titular, só números"
              className="mt-1 max-w-xs"
              autoComplete="off"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            O arquivo continua escolhido acima. Digite a senha e clique de novo — o comprovante é
            guardado já aberto, sem senha.
          </p>
          <Button type="button" onClick={handleRead} disabled={busy || !senha} className="mt-2">
            {busy ? "Abrindo…" : "Abrir e ler com a senha"}
          </Button>
        </div>
      ) : null}

      {result?.ok && result.enfileirado ? (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">
            ✓ {result.formaPagamento ? `${formaLabel(result.formaPagamento)} de ` : ""}
            {result.valor != null ? formatCurrency(result.valor) : "valor"} pago em{" "}
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
              ⚠ {ehCombo ? "O combo soma" : "O título está em"} {formatCurrency(amountAtual)} — a
              baixa vai sair pelo valor do comprovante, que é o que saiu do banco.
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
          Comprovante anexado. {ehCombo ? "Este combo" : "Este título"} já está pago — não há o que
          pré-lançar.
        </p>
      ) : null}
    </div>
  );
}
