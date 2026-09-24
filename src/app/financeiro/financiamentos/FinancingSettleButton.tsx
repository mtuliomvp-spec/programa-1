"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { settleFinancingAction, settleReturnAction } from "./actions";

type Account = { id: string; name: string };

export default function FinancingSettleButton({
  saleId,
  accounts,
  mode = "financing",
  label,
  programmedAmount = 0,
  workDate,
}: {
  saleId: string;
  accounts: Account[];
  mode?: "financing" | "return";
  label?: string;
  programmedAmount?: number;
  /**
   * Dia do movimento (AAAA-MM-DD): o do caixa aberto ou, fechado, o do último.
   * O crédito num dia DEPOIS dele vai para a fila do caixa daquele dia.
   */
  workDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(String(programmedAmount || ""));
  const [dataCredito, setDataCredito] = useState(workDate ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isReturn = mode === "return";
  const openLabel = label ?? "Receber (dar baixa)";
  // Crédito à frente do movimento: não baixa agora, espera o caixa do dia.
  const vaiParaFila = !!workDate && !!dataCredito && dataCredito > workDate;
  const diaLabel = (d: string) => formatDate(`${d}T12:00:00.000Z`);

  if (accounts.length === 0) {
    return <span className="text-xs text-amber-600">Cadastre uma conta da empresa</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-emerald-700 hover:underline"
      >
        {openLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="flex w-44 flex-col items-end gap-0.5 text-[11px] text-slate-500">
        Data do crédito no banco
        <input
          type="date"
          value={dataCredito}
          onChange={(e) => setDataCredito(e.target.value)}
          className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
        />
      </label>
      {isReturn ? (
        <input
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Valor recebido"
          title="Valor realmente pago pela financeira"
          className="h-8 w-44 rounded-lg border border-slate-300 bg-white px-2 text-right text-xs tabular-nums text-slate-900"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = isReturn
                ? await settleReturnAction(saleId, accountId, Number(amount), dataCredito)
                : await settleFinancingAction(saleId, accountId, dataCredito);
              if (!res.ok) setError(res.error || "Erro");
              else setOpen(false);
            })
          }
          className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
        >
          {pending ? "Recebendo..." : vaiParaFila ? "Deixar na fila" : "Confirmar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
          ✕
        </button>
      </div>
      {vaiParaFila ? (
        <p className="w-44 text-right text-[11px] text-sky-700">
          Caiu à frente do movimento ({diaLabel(workDate!)}): fica na fila e entra no caixa de{" "}
          {diaLabel(dataCredito)} com um ok.
        </p>
      ) : null}
      {error ? <p className="text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
