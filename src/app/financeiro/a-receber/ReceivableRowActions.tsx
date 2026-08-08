"use client";

import { useState, useTransition } from "react";
import { receiveAction, markPendingAction, receiveWithDiscountAction } from "./actions";

type Account = { id: string; name: string };

export default function ReceivableRowActions({
  id,
  status,
  amount,
  accounts,
  canReceber = true,
  canDiscount = false,
  hasVehicle = false,
}: {
  id: string;
  status: "PENDENTE" | "RECEBIDO" | "ATRASADO";
  amount: number;
  accounts: Account[];
  canReceber?: boolean;
  /** Pode perdoar a diferença (baixar como custo/despesa) em vez de deixá-la pendente. */
  canDiscount?: boolean;
  /** Título ligado a um carro: a diferença vira custo pós-venda dele. */
  hasVehicle?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [value, setValue] = useState<string>(String(amount));
  // O que fazer com a diferença: deixar pendente (padrão) ou dar desconto.
  const [discount, setDiscount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sem permissão de baixa: nenhum controle de receber/reverter aparece.
  if (!canReceber) return null;

  if (status === "RECEBIDO") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => markPendingAction(id))}
        className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-50"
      >
        Reverter
      </button>
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
                  const res = await receiveWithDiscountAction(id, pay, accountId);
                  if (!res.ok) setError(res.error || "Não foi possível dar o desconto.");
                  return;
                }
                await receiveAction(id, pay, accountId || undefined);
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

  return (
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
  );
}
