"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { payPartialAction } from "./actions";

type Account = { id: string; name: string };

/** Converte "1.234,50"/"1234.5" em número (ou NaN). */
function parseAmount(v: string): number {
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Pagamento parcial de um título: informa o valor pago agora; o saldo continua
 * em aberto em Contas a pagar como um título pendente.
 */
export default function PartialPayButton({
  payableId,
  total,
  accounts,
  cashboxDate = null,
}: {
  payableId: string;
  total: number;
  accounts: Account[];
  cashboxDate?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const parsed = parseAmount(value);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed < total;
  const remaining = valid ? Math.round((total - parsed) * 100) / 100 : null;

  function pay() {
    setMsg(null);
    if (!accountId) {
      setMsg("Escolha a conta.");
      return;
    }
    if (!valid) {
      setMsg(`Informe um valor entre R$ 0,01 e ${formatCurrency(total)}.`);
      return;
    }
    start(async () => {
      const r = await payPartialAction(payableId, parsed, accountId);
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
        title="Pagar só uma parte agora; o saldo continua em aberto"
      >
        Pagar parcial
      </button>
    );
  }

  return (
    <div className="w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm">
      <p className="text-xs text-slate-500">
        Total do título: <strong>{formatCurrency(total)}</strong>
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Valor a pagar agora
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0,00"
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
      <p className="text-xs text-slate-500">
        Data do pagamento: <strong>{cashboxDate ? `${cashboxDate} (caixa)` : "—"}</strong>
      </p>
      {remaining != null ? (
        <p className="text-xs text-slate-500">
          Saldo que continua em aberto: <strong>{formatCurrency(remaining)}</strong>
        </p>
      ) : null}
      {value.trim() && !valid ? (
        <p className="text-xs text-rose-600">
          {Number.isFinite(parsed) && parsed >= total
            ? `Não pode ser maior que o total (${formatCurrency(total)}). Para pagar tudo, use "Pagar título".`
            : "Informe um valor maior que zero."}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !valid}
          onClick={pay}
          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {pending ? "Pagando..." : "Pagar parcial"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
          Cancelar
        </button>
      </div>
      {msg ? <p className="text-xs text-rose-600">{msg}</p> : null}
    </div>
  );
}
