"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  conferirComprovanteLoteAction,
  preLancarPagamentoEmLoteAction,
  type ConferenciaLote,
  type PreLancarLoteResult,
} from "./actions";

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
 *
 * A conta debitada continua sendo a ESCOLHIDA na barra de ações — o comprovante
 * não a troca sozinho. Mas, assim que o arquivo é anexado, a IA o lê e diz de
 * qual conta ele parece ser: batendo, um ✓; divergindo, o aviso aparece aqui,
 * antes de confirmar, com o botão para adotar a conta do comprovante.
 */
export default function PreLancarLote({
  ids,
  accountId,
  accountName,
  total,
  cashboxDate,
  onAccountChange,
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
  /** Adotar a conta que o comprovante mostra (troca a escolhida na barra). */
  onAccountChange?: (accountId: string) => void;
  /** Deu certo: a barra limpa a seleção e recarrega a lista. */
  onDone: (mensagem: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState(hojeLocal);
  const [senha, setSenha] = useState("");
  const [res, setRes] = useState<PreLancarLoteResult | null>(null);
  const [conf, setConf] = useState<ConferenciaLote | null>(null);
  const [lendo, startLer] = useTransition();
  const [pending, start] = useTransition();

  /** Lê o comprovante na hora do anexo: o usuário confere antes de confirmar. */
  function conferir() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setConf(null);
      return;
    }
    setConf(null);
    setRes(null);
    startLer(async () => {
      const fd = new FormData();
      fd.set("file", await resizeImageToJpeg(file));
      if (senha) fd.set("senha", senha);
      const r = await conferirComprovanteLoteAction(fd);
      setConf(r);
      // A data do papel vale mais que o "hoje" do campo: é o dia em que o
      // dinheiro saiu do banco, e é por ele que a fila espera o caixa.
      if (r.ok && r.data) setData(r.data);
    });
  }

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
  // A conta do comprovante é outra: o pagamento sairia da conta errada.
  const contaDiverge = Boolean(conf?.ok && conf.accountId && conf.accountId !== accountId);
  const contaConfere = Boolean(conf?.ok && conf.accountId && conf.accountId === accountId);
  const valorDiverge = Boolean(conf?.ok && conf.valor != null && Math.abs(conf.valor - total) > 0.01);
  const pedeSenha = Boolean(res?.senhaNecessaria || conf?.senhaNecessaria);

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
            onChange={() => {
              setSenha("");
              conferir();
            }}
            className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </label>
        <Button type="button" onClick={confirmar} disabled={pending || lendo || !ids.length}>
          {pending ? "Pré-lançando…" : "Confirmar o pagamento"}
        </Button>
      </div>

      {lendo ? <p className="mt-2 text-xs text-slate-500">Lendo o comprovante…</p> : null}

      {conf?.ok ? (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
          ✓ Li o comprovante: {conf.valor != null ? formatCurrency(conf.valor) : "valor não lido"}
          {conf.data ? ` em ${dataBr(conf.data)}` : ""}
          {conf.accountName
            ? ` · debitado de ${conf.accountName}`
            : conf.contaLida
              ? ` · conta no papel: ${conf.contaLida}`
              : ""}
          {contaConfere ? " — confere com a conta escolhida" : ""}.
        </p>
      ) : null}

      {contaDiverge ? (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>
            ⚠️ O comprovante é da conta <strong>{conf?.accountName}</strong>, mas o pagamento vai
            sair de <strong>{accountName ?? "—"}</strong> (a conta escolhida na barra). Confirmando
            assim, o dinheiro sai da conta errada.
          </p>
          {onAccountChange ? (
            <button
              type="button"
              onClick={() => onAccountChange(conf!.accountId!)}
              className="mt-1 font-semibold text-amber-900 underline"
            >
              Usar {conf?.accountName} como conta debitada
            </button>
          ) : null}
        </div>
      ) : null}

      {conf?.ok && !conf.accountId ? (
        <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          Não reconheci no comprovante nenhuma das contas cadastradas
          {conf.contaLida ? ` (o papel diz "${conf.contaLida}")` : ""} — confira você mesmo a conta
          debitada acima.
        </p>
      ) : null}

      {valorDiverge ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          ⚠️ O comprovante é de {formatCurrency(conf!.valor!)} e os títulos selecionados somam{" "}
          {formatCurrency(total)}. Se o pagamento cobre outros títulos, selecione-os também antes de
          confirmar.
        </p>
      ) : null}

      {conf && !conf.ok && !conf.senhaNecessaria && conf.error ? (
        <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          Não consegui conferir o comprovante ({conf.error}) — o anexo continua valendo, confira a
          conta e o valor você mesmo.
        </p>
      ) : null}

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

      {pedeSenha ? (
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
          {conf?.senhaNecessaria ? (
            <Button type="button" className="mt-2" onClick={conferir} disabled={lendo || !senha}>
              {lendo ? "Abrindo…" : "Ler com a senha"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
