"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  lerComprovanteTransferenciaAction,
  preLancarTransferenciaAction,
  type LeituraTransferencia,
} from "./actions";

type Option = { id: string; name: string };

/** Hoje pelo relógio de quem está na tela (o do banco), não pelo UTC. */
function hojeLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * "Já transferi": a transferência entre as contas da loja JÁ saiu do banco, num
 * dia que o movimento de caixa ainda não alcançou — o mesmo caso do "Já paguei"
 * dos títulos. Anexando o comprovante, a IA lê o valor, a data do débito e as
 * DUAS contas (a debitada e a creditada); ao usuário resta conferir e confirmar.
 *
 * Nada de saldo se move aqui: a transferência fica esperando e só é efetivada
 * com o ok, quando o caixa daquele dia estiver aberto.
 */
export default function InformarTransferencia({
  accounts,
  cashboxDate = null,
}: {
  accounts: Option[];
  /** Data do movimento aberto (dd/mm/aaaa), para dizer se vai esperar. */
  cashboxDate?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [lendo, startLer] = useTransition();
  const [salvando, startSalvar] = useTransition();
  const [leitura, setLeitura] = useState<LeituraTransferencia | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(hojeLocal);
  const [description, setDescription] = useState("");

  async function ler() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setErro(null);
    setOk(null);
    startLer(async () => {
      const fd = new FormData();
      fd.set("file", await resizeImageToJpeg(file));
      if (senha) fd.set("senha", senha);
      const r = await lerComprovanteTransferenciaAction(fd);
      setLeitura(r);
      if (!r.ok) {
        setErro(r.error ?? "Não consegui ler o comprovante.");
        return;
      }
      // O que a leitura identificou entra nos campos; o resto fica para o
      // usuário escolher — nada é gravado sem a confirmação dele.
      if (r.fromId) setFromId(r.fromId);
      if (r.toId) setToId(r.toId);
      if (r.valor != null) setAmount(r.valor.toFixed(2));
      if (r.data) setDate(r.data);
      if (r.descricao) setDescription(r.descricao);
    });
  }

  function confirmar() {
    setErro(null);
    setOk(null);
    startSalvar(async () => {
      const fd = new FormData();
      fd.set("fromId", fromId);
      fd.set("toId", toId);
      fd.set("amount", amount);
      fd.set("date", date);
      fd.set("description", description);
      if (leitura?.avisos?.length) fd.set("note", leitura.avisos.join(" · "));
      const file = fileRef.current?.files?.[0];
      if (file) fd.set("file", await resizeImageToJpeg(file));
      const r = await preLancarTransferenciaAction(fd);
      if (r.error) {
        setErro(r.error);
        return;
      }
      setOk(
        `Transferência de ${formatCurrency(Number(amount) || 0)} informada para ${formatDate(date)}. ` +
          "Ela espera o movimento de caixa chegar nesse dia para ser confirmada.",
      );
      setLeitura(null);
      setAmount("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const esperaCaixa = Boolean(cashboxDate && date && formatDate(date) !== cashboxDate);

  if (!aberto) {
    return (
      <div className="border-t border-slate-100 px-5 py-3">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          🧾 Já transferi (fora do dia do movimento) — informar pelo comprovante
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-emerald-50/50 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-900">🧾 Já transferi — informar e esperar o caixa</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            O dinheiro já andou entre as contas num dia que o movimento ainda não alcançou. Anexe o
            comprovante: a IA lê o <strong>valor</strong>, a <strong>data do débito</strong> e as{" "}
            <strong>duas contas</strong> — você confere e confirma. Nada muda de saldo agora; a
            transferência entra de verdade quando o caixa daquele dia for aberto e você der o ok.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 text-xs font-medium text-slate-500 hover:underline"
        >
          Fechar
        </button>
      </div>

      <div className="mt-3">
        <Field label="Comprovante da transferência (PDF ou imagem)">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            onChange={() => {
              setSenha("");
              void ler();
            }}
            className="block w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </Field>
        {lendo ? <p className="mt-1 text-xs text-slate-500">Lendo o comprovante…</p> : null}
        {leitura?.ok ? (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            ✓ Li o comprovante: {leitura.valor != null ? formatCurrency(leitura.valor) : "valor"}
            {leitura.data ? ` em ${formatDate(leitura.data)}` : ""}
            {leitura.origemLida ? ` · debitado de ${leitura.origemLida}` : ""}
            {leitura.destinoLido ? ` · creditado em ${leitura.destinoLido}` : ""}.
          </p>
        ) : null}
        {leitura?.ok && leitura.avisos?.length ? (
          <p className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠️ {leitura.avisos.join(" · ")}.
          </p>
        ) : null}
        {leitura?.senhaNecessaria ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-600">
              Senha do documento
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 max-w-xs"
                autoComplete="off"
              />
            </label>
            <Button type="button" onClick={() => void ler()} disabled={lendo || !senha}>
              {lendo ? "Abrindo…" : "Ler com a senha"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="De (conta debitada)" required>
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Escolha a conta…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Para (conta creditada)" required>
          <Select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Escolha a conta…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor (R$)" required>
          <Input
            type="number"
            step="0.01"
            min={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Data em que saiu do banco" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Descrição (opcional)">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: TED mesma titularidade"
          />
        </Field>
      </div>

      {esperaCaixa ? (
        <p className="mt-2 text-[11px] text-slate-500">
          O movimento aberto é de {cashboxDate} — a transferência fica esperando até o caixa alcançar{" "}
          {formatDate(date)}.
        </p>
      ) : null}
      {erro ? <p className="mt-2 text-sm text-rose-600">{erro}</p> : null}
      {ok ? <p className="mt-2 text-sm font-medium text-emerald-700">{ok}</p> : null}

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          onClick={confirmar}
          disabled={salvando || lendo || !fromId || !toId || !amount || !date}
        >
          {salvando ? "Informando…" : "Confirmar a transferência informada"}
        </Button>
      </div>
    </div>
  );
}
