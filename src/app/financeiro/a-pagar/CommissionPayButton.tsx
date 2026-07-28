"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, toDateInputValue } from "@/lib/format";
import { payCommissionWithExcessAction } from "./actions";

type Account = { id: string; name: string };

/** Converte "1.234,50"/"1234.5" em número (ou NaN). */
function parseAmount(v: string): number {
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Baixa de comissão podendo pagar um valor MAIOR que a comissão — o excedente
 * é debitado do capital do beneficiário vinculado ao vendedor.
 */
export default function CommissionPayButton({
  payableId,
  commissionAmount,
  accounts,
  beneficiaryName,
  free,
}: {
  payableId: string;
  commissionAmount: number;
  accounts: Account[];
  beneficiaryName: string;
  free: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [total, setTotal] = useState(commissionAmount.toFixed(2).replace(".", ","));
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const parsedTotal = parseAmount(total);
  const excedente = Number.isFinite(parsedTotal) ? Math.round((parsedTotal - commissionAmount) * 100) / 100 : 0;
  const passaDoLivre = excedente > 0 && excedente > free;

  function pay() {
    setMsg(null);
    if (!accountId) {
      setMsg("Escolha a conta.");
      return;
    }
    start(async () => {
      const r = await payCommissionWithExcessAction(payableId, accountId, total, date);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível pagar.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-blue-700 hover:underline"
        title="Pagar a comissão podendo incluir um excedente debitado do capital"
      >
        Pagar c/ excedente
      </button>
    );
  }

  return (
    <div className="w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm">
      <p className="text-xs text-slate-500">
        Comissão: <strong>{formatCurrency(commissionAmount)}</strong>
        <br />
        Vinculado a <strong>{beneficiaryName}</strong> · capital livre {formatCurrency(free)}
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Valor total pago
        <input
          inputMode="decimal"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Conta
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Data
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
        />
      </label>
      {excedente > 0 ? (
        <p className={`text-xs ${passaDoLivre ? "text-amber-700" : "text-slate-500"}`}>
          Excedente de <strong>{formatCurrency(excedente)}</strong> vira retirada de capital de {beneficiaryName}.
          {passaDoLivre ? " ⚠ Passa do capital livre — o capital dele ficará negativo." : ""}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={pay}
          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? "Pagando..." : "Pagar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
          Cancelar
        </button>
      </div>
      {msg ? <p className="text-xs text-rose-600">{msg}</p> : null}
    </div>
  );
}
