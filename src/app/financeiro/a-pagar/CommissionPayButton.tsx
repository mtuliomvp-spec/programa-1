"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { settleCommissionAction } from "./actions";

type Account = { id: string; name: string };

/** Converte "1.234,50"/"1234.5" em número (ou NaN). */
function parseAmount(v: string): number {
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Baixa de comissão informando o VALOR PAGO ao vendedor. A diferença acerta o
 * capital do beneficiário vinculado: pagar MAIS que a comissão vira retirada;
 * pagar MENOS cobre o saldo devedor do vendedor como aporte (via Banco Neutro).
 */
export default function CommissionPayButton({
  payableId,
  commissionAmount,
  accounts,
  beneficiaryName,
  free,
  capital,
  cashboxDate = null,
}: {
  payableId: string;
  commissionAmount: number;
  accounts: Account[];
  beneficiaryName: string;
  free: number;
  capital: number;
  cashboxDate?: string | null;
}) {
  const router = useRouter();
  // Saldo devedor de capital do vendedor (quando negativo). O padrão do valor
  // pago já desconta a dívida — cobri-la é o caso comum.
  const debt = Math.max(0, Math.round(-capital * 100) / 100);
  const defaultPayout = Math.round((commissionAmount - debt) * 100) / 100;

  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [payout, setPayout] = useState(defaultPayout.toFixed(2).replace(".", ","));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const parsedPayout = parseAmount(payout);
  const diff = Number.isFinite(parsedPayout)
    ? Math.round((commissionAmount - parsedPayout) * 100) / 100
    : 0;
  const excedente = diff < 0 ? Math.round(-diff * 100) / 100 : 0;
  const abate = diff > 0 ? diff : 0;
  const passaDoLivre = excedente > 0 && excedente > free;

  function pay() {
    setMsg(null);
    if (!accountId) {
      setMsg("Escolha a conta.");
      return;
    }
    start(async () => {
      const r = await settleCommissionAction(payableId, accountId, payout);
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
        title="Pagar a comissão; a diferença acerta o capital do vendedor"
      >
        Pagar comissão
      </button>
    );
  }

  return (
    <div className="w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm">
      <p className="text-xs text-slate-500">
        Comissão: <strong>{formatCurrency(commissionAmount)}</strong>
        <br />
        Vinculado a <strong>{beneficiaryName}</strong>
        <br />
        Saldo de capital:{" "}
        <strong className={capital < 0 ? "text-rose-600" : "text-emerald-600"}>
          {formatCurrency(capital)}
        </strong>
        {debt > 0 ? " (devedor)" : null}
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Valor pago ao vendedor
        <input
          inputMode="decimal"
          value={payout}
          onChange={(e) => setPayout(e.target.value)}
          className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 px-2 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={() => setPayout("0,00")}
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        Aplicar tudo no capital
      </button>
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
      {abate > 0 ? (
        <p className="text-xs text-slate-500">
          <strong>{formatCurrency(abate)}</strong> viram aporte no capital de {beneficiaryName}
          {debt > 0 ? ` (cobre o saldo devedor de ${formatCurrency(debt)})` : ""}.
        </p>
      ) : null}
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
