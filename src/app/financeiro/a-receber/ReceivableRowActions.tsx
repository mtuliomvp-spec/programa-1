"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  receiveAction,
  markPendingAction,
  receiveWithDiscountAction,
  correctReceivedDateAction,
  receiveFromCapitalAction,
  informarRecebimentoAction,
  desfazerRecebimentoInformadoAction,
} from "./actions";
import FixDateButton from "@/components/FixDateButton";

type Account = { id: string; name: string };

export default function ReceivableRowActions({
  id,
  status,
  amount,
  accounts,
  beneficiaries = [],
  canReceber = true,
  canDiscount = false,
  hasVehicle = false,
  canFixDate = false,
  receivedDateInput = null,
  queued = null,
}: {
  id: string;
  status: "PENDENTE" | "RECEBIDO" | "ATRASADO";
  amount: number;
  accounts: Account[];
  /** Sócios ativos — habilita receber abatendo do capital ("No capital"). */
  beneficiaries?: Account[];
  canReceber?: boolean;
  /** Pode perdoar a diferença (baixar como custo/despesa) em vez de deixá-la pendente. */
  canDiscount?: boolean;
  /** Título ligado a um carro: a diferença vira custo pós-venda dele. */
  hasVehicle?: boolean;
  /** Pode corrigir a data de um recebimento já feito. */
  canFixDate?: boolean;
  /** Data atual do recebimento (yyyy-mm-dd), para preencher o campo. */
  receivedDateInput?: string | null;
  /** Já informado que entrou: espera o caixa alcançar o dia para creditar. */
  queued?: { date: string; amount: number; proof: boolean } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [value, setValue] = useState<string>(String(amount));
  // O que fazer com a diferença: deixar pendente (padrão) ou dar desconto.
  const [discount, setDiscount] = useState(false);
  // Observação do recebimento (fica nas notas do título / da parcela recebida).
  const [note, setNote] = useState("");
  // Receber abatendo do capital de um sócio (venda de veículo para sócio etc.).
  const [capitalChoosing, setCapitalChoosing] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState(beneficiaries[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  // "Informar entrada": o dinheiro já caiu na conta, mas o movimento do caixa
  // ainda não chegou naquele dia. Aqui não se lê comprovante — do lado de quem
  // recebe ele muitas vezes não existe (o cliente avisa, o extrato mostra), então
  // o que vale é o que a pessoa que viu o extrato digita. O anexo é opcional.
  const [informando, setInformando] = useState(false);
  // Padrão: hoje — é o dia em que se costuma ver a entrada no extrato.
  const [entradaData, setEntradaData] = useState(new Date().toISOString().slice(0, 10));
  const [entradaValor, setEntradaValor] = useState(String(amount));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  // Sem permissão de baixa: nenhum controle de receber/reverter aparece.
  if (!canReceber) return null;

  if (status === "RECEBIDO") {
    return (
      <div className="flex items-center justify-end gap-3">
        {canFixDate && receivedDateInput ? (
          <FixDateButton
            currentDate={receivedDateInput}
            kind="recebimento"
            onSave={(d) => correctReceivedDateAction(id, d)}
          />
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markPendingAction(id))}
          className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-50"
        >
          Reverter
        </button>
      </div>
    );
  }

  if (choosing) {
    const pay = Number(value) || 0;
    const restante = Math.max(0, Math.round((amount - pay) * 100) / 100);
    const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return (
      <div className="flex flex-col items-end gap-1.5">
        <input
          type="number"
          step="0.01"
          min={0.01}
          max={amount}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-32 rounded-lg border border-slate-300 bg-white px-2 text-right text-xs text-slate-900"
          placeholder="Valor recebido"
        />
        {accounts.length > 0 ? (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-8 w-40 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : null}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Observação (opcional) — ex.: pix feito pelo irmão"
          className="w-56 rounded-lg border border-slate-300 bg-white px-2 py-1 text-left text-xs text-slate-900"
        />
        {pay > 0 && pay < amount ? (
          canDiscount && hasVehicle ? (
            <div className="w-56 rounded-lg border border-amber-200 bg-amber-50 p-2 text-left">
              <p className="text-[11px] font-medium text-amber-800">
                Faltam {money(restante)}. O que fazer?
              </p>
              <label className="mt-1 flex cursor-pointer items-start gap-1.5 text-[11px] text-slate-700">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={!discount}
                  onChange={() => setDiscount(false)}
                />
                <span>Restante continua pendente</span>
              </label>
              <label className="mt-1 flex cursor-pointer items-start gap-1.5 text-[11px] text-slate-700">
                <input
                  type="radio"
                  className="mt-0.5"
                  checked={discount}
                  onChange={() => setDiscount(true)}
                />
                <span>
                  <strong>Dar desconto</strong> — o título é quitado e os {money(restante)} viram
                  custo pós-venda do veículo (reduzem o lucro dele)
                </span>
              </label>
            </div>
          ) : (
            <p className="text-[11px] text-amber-600">Restante fica pendente: {money(restante)}</p>
          )
        ) : null}
        {error ? <p className="w-56 text-[11px] text-rose-600">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || pay <= 0}
            onClick={() => {
              setError(null);
              const darDesconto = discount && pay < amount;
              startTransition(async () => {
                if (darDesconto) {
                  const res = await receiveWithDiscountAction(id, pay, accountId, note);
                  if (!res.ok) setError(res.error || "Não foi possível dar o desconto.");
                  return;
                }
                await receiveAction(id, pay, accountId || undefined, note || undefined);
              });
            }}
            className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setChoosing(false);
              setValue(String(amount));
              setDiscount(false);
              setNote("");
              setError(null);
            }}
            className="text-xs text-slate-400 hover:underline"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (capitalChoosing) {
    const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="w-60 rounded-lg border border-violet-200 bg-violet-50 p-2 text-left">
          <p className="text-[11px] font-medium text-violet-900">
            Abater {money(amount)} do capital de:
          </p>
          <select
            value={beneficiaryId}
            onChange={(e) => setBeneficiaryId(e.target.value)}
            className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
          >
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-600">
            Sem dinheiro em caixa: o título é quitado e o valor vira{" "}
            <strong>retirada de capital</strong> do sócio (o saldo dele diminui).
          </p>
        </div>
        {error ? <p className="w-60 text-[11px] text-rose-600">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || !beneficiaryId}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await receiveFromCapitalAction(id, beneficiaryId);
                if (!res.ok) setError(res.error || "Não foi possível abater do capital.");
              });
            }}
            className="text-sm font-medium text-violet-700 hover:underline disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCapitalChoosing(false);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:underline"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (informando) {
    const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const valor = Number(entradaValor) || 0;
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="w-64 rounded-lg border border-sky-200 bg-sky-50 p-2 text-left">
          <p className="text-[11px] font-medium text-sky-900">
            O dinheiro já caiu na conta? Informe e ele fica pré-lançado até o movimento chegar no
            dia.
          </p>
          <label className="mt-1.5 block text-[11px] text-slate-600">
            Entrou em
            <input
              type="date"
              value={entradaData}
              onChange={(e) => setEntradaData(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
            />
          </label>
          <label className="mt-1.5 block text-[11px] text-slate-600">
            Valor que entrou
            <input
              type="number"
              step="0.01"
              min={0.01}
              max={amount}
              value={entradaValor}
              onChange={(e) => setEntradaValor(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-right text-xs text-slate-900"
            />
          </label>
          <label className="mt-1.5 block text-[11px] text-slate-600">
            Conta creditada
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-1.5 block text-[11px] text-slate-600">
            Comprovante ou print do extrato (opcional)
            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="mt-0.5 block w-full text-[11px] text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-white file:px-2 file:py-1 file:text-[11px]"
            />
          </label>
          {valor > 0 && valor < amount ? (
            <p className="mt-1 text-[11px] text-amber-700">
              Parcial: entram {money(valor)} e {money(Math.round((amount - valor) * 100) / 100)}{" "}
              continuam a receber.
            </p>
          ) : null}
        </div>
        {avisos.length ? (
          <ul className="w-64 list-inside list-disc text-left text-[11px] text-amber-700">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="w-64 text-[11px] text-rose-600">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || valor <= 0 || !accountId || !entradaData}
            onClick={() => {
              setError(null);
              setAvisos([]);
              startTransition(async () => {
                const fd = new FormData();
                fd.set("receivableId", id);
                fd.set("date", entradaData);
                fd.set("amount", String(valor));
                fd.set("accountId", accountId);
                if (arquivo) fd.set("file", arquivo);
                const res = await informarRecebimentoAction(fd);
                if (!res.ok) {
                  setError(res.error || "Não foi possível informar a entrada.");
                  return;
                }
                setAvisos(res.avisos ?? []);
                setInformando(false);
                router.refresh();
              });
            }}
            className="text-sm font-medium text-sky-700 hover:underline disabled:opacity-50"
          >
            {pending ? "Informando..." : "Informar entrada"}
          </button>
          <button
            type="button"
            onClick={() => {
              setInformando(false);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:underline"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Já informado: a linha mostra o pré-lançamento e o caminho de desfazer. O
  // crédito de verdade é dado em Contas e caixas, no dia do movimento.
  if (queued) {
    const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const [a, m, d] = queued.date.slice(0, 10).split("-");
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-medium text-amber-700" title="Confirme em Contas e caixas quando o movimento alcançar esse dia.">
          ⏳ entrada informada · {money(queued.amount)} em {`${d}/${m}/${a}`}
        </span>
        <span className="flex items-center gap-2">
          {queued.proof ? (
            <a
              href={`/financeiro/a-receber/comprovante/${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-blue-700 hover:underline"
            >
              ver comprovante
            </a>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await desfazerRecebimentoInformadoAction(id);
              });
            }}
            className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50"
          >
            desfazer
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setValue(String(amount));
          setChoosing(true);
        }}
        className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
      >
        Receber
      </button>
      {accounts.length > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEntradaValor(String(amount));
            setInformando(true);
          }}
          title="O dinheiro já caiu na conta, mas o movimento do caixa ainda não chegou nesse dia"
          className="text-sm font-medium text-sky-700 hover:underline disabled:opacity-50"
        >
          Já caiu
        </button>
      ) : null}
      {beneficiaries.length > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => setCapitalChoosing(true)}
          title="Receber abatendo do capital de um sócio (sem dinheiro em caixa)"
          className="text-sm font-medium text-violet-700 hover:underline disabled:opacity-50"
        >
          No capital
        </button>
      ) : null}
    </div>
  );
}
