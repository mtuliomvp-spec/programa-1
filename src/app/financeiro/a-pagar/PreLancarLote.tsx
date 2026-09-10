"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { preLancarPagamentoEmLoteAction, type PreLancarLoteResult } from "./actions";

/** yyyy-mm-dd (do campo de data) → dd/mm/aaaa, sem passar pelo fuso. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Hoje pelo relógio de quem está na tela (o do banco), não pelo UTC. */
function hojeLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * "Já paguei": informa que os títulos SELECIONADOS saíram do banco de uma vez
 * e os põe na fila do caixa.
 *
 * É o caso do boleto que cobre vários títulos — a fatura mensal da comunicação
 * de venda vem com uma linha por veículo e um pagamento só. Pagar em lote a
 * barra já fazia, mas só pelo dia do movimento; aqui o pagamento pode ser
 * informado ANTES de o caixa alcançar o dia em que o dinheiro saiu, com o
 * comprovante anexado a todos eles.
 */
export default function PreLancarLote({
  ids,
  accountId,
  accountName,
  total,
  cashboxDate,
  onDone,
}: {
  ids: string[];
  /** Conta debitada: é a mesma escolhida na barra de ações. */
  accountId: string;
  accountName: string | null;
  /** Soma dos selecionados, já com o desconto do boleto quando vale. */
  total: number;
  /** Data do movimento aberto, já em dd/mm/aaaa, para dizer se vai esperar. */
  cashboxDate: string | null;
  /** Deu certo: a barra limpa a seleção e recarrega a lista. */
  onDone: (mensagem: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(hojeLocal);
  const [senha, setSenha] = useState("");
  const [res, setRes] = useState<PreLancarLoteResult | null>(null);
  const [pending, start] = useTransition();

  function confirmar() {
    setRes(null);
    start(async () => {
      const fd = new FormData();
      fd.set("ids", ids.join(","));
      fd.set("date", data);
      fd.set("accountId", accountId);
      const file = fileRef.current?.files?.[0];
      if (file) fd.set("file", await resizeImageToJpeg(file));
      if (senha) fd.set("senha", senha);
      const r = await preLancarPagamentoEmLoteAction(fd);
      setRes(r);
      if (!r.ok) return;
      // Faltando a senha o arquivo tem de continuar escolhido; deu certo, some.
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      // Os avisos da conferência vão junto da mensagem: o painel se fecha com a
      // seleção, e eles não podem sumir com ele.
      onDone(
        `${r.enfileirados} título(s) pré-lançado(s) para ${dataBr(data)}` +
          (r.attached ? " com o comprovante anexado" : "") +
          ". Confirme em Contas e caixas quando o movimento chegar no dia." +
          (r.avisos?.length ? ` ⚠️ Confira: ${r.avisos.join("; ")}.` : ""),
      );
    });
  }

  const esperaCaixa = Boolean(cashboxDate && cashboxDate !== dataBr(data));

  return (
    <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
      <p className="text-sm font-semibold text-emerald-900">
        🧾 Já paguei estes {ids.length} título(s) — pré-lançar
      </p>
      <p className="mt-0.5 text-xs text-emerald-800">
        Um boleto só costuma cobrir vários títulos (a fatura da comunicação de venda vem com uma
        linha por veículo). Informe a data em que o dinheiro saiu do banco e anexe o comprovante: ele
        fica em <strong>todos</strong> os títulos e cada um entra na fila pelo seu próprio valor
        {total > 0 ? ` (somam ${formatCurrency(total)})` : ""}. A baixa acontece quando o movimento
        de caixa daquele dia for aberto e confirmado.
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Data em que saiu do banco
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="max-w-[170px]"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs text-slate-600">
          Conta debitada
          <span className="flex h-9 items-center rounded-lg bg-white px-2 text-sm font-medium text-slate-700">
            {accountName ?? "—"}
          </span>
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Comprovante (opcional)
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </label>
        <Button type="button" onClick={confirmar} disabled={pending || !ids.length}>
          {pending ? "Pré-lançando…" : "Confirmar o pagamento"}
        </Button>
      </div>
      {pending ? (
        <p className="mt-2 text-xs text-slate-500">
          Anexando o comprovante em cada título — pode levar alguns segundos. Não feche a página.
        </p>
      ) : null}
      {esperaCaixa ? (
        <p className="mt-1 text-[11px] text-slate-500">
          O movimento aberto é de {cashboxDate} — o pagamento fica na fila até o caixa alcançar o dia
          informado.
        </p>
      ) : null}

      {res?.error ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ {res.error}
        </p>
      ) : null}

      {res?.senhaNecessaria ? (
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
            O arquivo continua escolhido acima. Digite a senha e confirme de novo — o comprovante é
            guardado já aberto, sem senha.
          </p>
        </div>
      ) : null}

    </div>
  );
}
