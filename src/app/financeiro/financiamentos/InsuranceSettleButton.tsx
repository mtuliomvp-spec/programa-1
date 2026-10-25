"use client";

import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { settleInsuranceAction } from "./actions";

type Account = { id: string; name: string };

/**
 * Baixa da comissão de seguro. Diferente do retorno, aqui não há valor
 * programado: o dono digita o valor que caiu e a comissão do vendedor, que já
 * vem sugerida pelo mesmo percentual do retorno da financeira.
 *
 * Como o repasse e o retorno, aceita a data do crédito: caiu À FRENTE do
 * movimento ("já caiu"), fica na fila e entra no caixa daquele dia com um ok.
 */
export default function InsuranceSettleButton({
  saleId,
  accounts,
  sellerPercent = 0,
  workDate,
  pagadores = [],
}: {
  saleId: string;
  accounts: Account[];
  /** % do líquido que vai para o vendedor (o mesmo do retorno). 0 = sem comissão. */
  sellerPercent?: number;
  /** Dia do movimento (AAAA-MM-DD): o do caixa aberto ou, fechado, o do último. */
  workDate?: string | null;
  /** Seguradoras já usadas — sugestões do campo "Pago por". */
  pagadores?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [dataCredito, setDataCredito] = useState(workDate ?? "");
  const [pagador, setPagador] = useState(pagadores[0] ?? "");
  const [commission, setCommission] = useState("");
  // Enquanto o usuário não mexer na comissão, ela acompanha o valor digitado.
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const valor = Number(amount) || 0;
  const sugerida = Math.round(valor * (sellerPercent / 100) * 100) / 100;
  const comissaoAtual = commissionTouched ? Number(commission) || 0 : sugerida;
  // Crédito à frente do movimento: não baixa agora, espera o caixa do dia.
  const vaiParaFila = !!workDate && !!dataCredito && dataCredito > workDate;
  const diaLabel = (d: string) => formatDate(`${d}T12:00:00.000Z`);
  const listaId = `pagadores-${saleId}`;

  if (accounts.length === 0) {
    return <span className="text-xs text-amber-600">Cadastre uma conta da empresa</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        Receber seguro
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 text-xs">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-0.5 text-[11px] text-slate-500">
        Data do crédito no banco
        <input
          type="date"
          value={dataCredito}
          onChange={(e) => setDataCredito(e.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-slate-500">
        Pago por (seguradora)
        <input
          value={pagador}
          onChange={(e) => setPagador(e.target.value)}
          list={listaId}
          maxLength={80}
          placeholder="Pago por (ex.: Cardif do Brasil)"
          title="Quem creditou a comissão — a seguradora, que nem sempre é a financeira"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
        />
      </label>
      <datalist id={listaId}>
        {pagadores.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <input
        type="number"
        step="0.01"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Valor recebido"
        title="Quanto a seguradora/financeira pagou de comissão"
        className="w-full rounded border border-slate-300 px-2 py-1"
      />
      {sellerPercent > 0 ? (
        <>
          <input
            type="number"
            step="0.01"
            min={0}
            value={commissionTouched ? commission : sugerida ? String(sugerida) : ""}
            onChange={(e) => {
              setCommissionTouched(true);
              setCommission(e.target.value);
            }}
            placeholder="Comissão do vendedor"
            title={`Sugerida: ${sellerPercent.toLocaleString("pt-BR")}% do valor recebido`}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
          <p className="text-[11px] text-slate-500">
            Comissão sugerida ({sellerPercent.toLocaleString("pt-BR")}%):{" "}
            {formatCurrency(sugerida)} — pode ajustar ou zerar.
          </p>
        </>
      ) : null}
      {valor > 0 ? (
        <p className="text-[11px] text-emerald-700">
          Entra {formatCurrency(valor)} na conta · lucro do carro sobe{" "}
          {formatCurrency(valor - comissaoAtual)}
        </p>
      ) : null}
      {vaiParaFila ? (
        <p className="text-[11px] text-sky-700">
          Caiu à frente do movimento ({diaLabel(workDate!)}): fica na fila e entra no caixa de{" "}
          {diaLabel(dataCredito)} com um ok.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await settleInsuranceAction(saleId, accountId, valor, comissaoAtual, dataCredito, pagador);
              if (!r.ok) setError(r.error ?? "Não foi possível receber.");
              else setOpen(false);
            });
          }}
          className="rounded bg-blue-600 px-2 py-1 font-medium text-white disabled:opacity-50"
        >
          {pending ? "..." : vaiParaFila ? "Deixar na fila" : "Confirmar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:underline">
          Cancelar
        </button>
      </div>
      {error ? <p className="text-rose-600">{error}</p> : null}
    </div>
  );
}
