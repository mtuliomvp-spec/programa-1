"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { markPaidAction, markPendingAction } from "./actions";

type Account = { id: string; name: string };

export default function PayableRowActions({
  id,
  status,
  accounts,
}: {
  id: string;
  status: "PENDENTE" | "PAGO" | "ATRASADO";
  accounts: Account[];
}) {
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  if (status === "PAGO") {
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

  if (choosing && accounts.length > 0) {
    return (
      <div className="flex items-center justify-end gap-2">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markPaidAction(id, accountId))}
          className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setChoosing(false)}
          className="text-xs text-slate-400 hover:underline"
        >
          ✕
        </button>
      </div>
    );
  }

  // Sem conta financeira cadastrada não há como registrar o pagamento —
  // orienta a criar uma conta antes de dar a baixa.
  if (accounts.length === 0) {
    return (
      <Link href="/financeiro/contas" className="text-sm font-medium text-blue-700 hover:underline">
        Criar conta p/ pagar
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (accounts.length > 1) setChoosing(true);
        else startTransition(() => markPaidAction(id, accounts[0]?.id));
      }}
      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
    >
      {pending ? "Salvando..." : "Marcar como pago"}
    </button>
  );
}
