"use client";

import { useState, useTransition } from "react";
import { receiveAction, markPendingAction } from "./actions";

type Account = { id: string; name: string };

export default function ReceivableRowActions({
  id,
  status,
  amount,
  accounts,
}: {
  id: string;
  status: "PENDENTE" | "RECEBIDO" | "ATRASADO";
  amount: number;
  accounts: Account[];
}) {
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [value, setValue] = useState<string>(String(amount));

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
          <p className="text-[11px] text-amber-600">Restante fica pendente: {restante.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || pay <= 0}
            onClick={() => startTransition(() => receiveAction(id, pay, accountId || undefined))}
            className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setChoosing(false);
              setValue(String(amount));
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
