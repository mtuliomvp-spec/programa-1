"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { settleInsuranceAction } from "./actions";

type Account = { id: string; name: string };

/**
 * Baixa da comissão de seguro. Diferente do retorno, aqui não há valor
 * programado: o dono digita o valor que caiu e a comissão do vendedor, que já
 * vem sugerida pelo mesmo percentual do retorno da financeira.
 */
export default function InsuranceSettleButton({
  saleId,
  accounts,
  sellerPercent = 0,
}: {
  saleId: string;
  accounts: Account[];
  /** % do líquido que vai para o vendedor (o mesmo do retorno). 0 = sem comissão. */
  sellerPercent?: number;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("");
  // Enquanto o usuário não mexer na comissão, ela acompanha o valor digitado.
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const valor = Number(amount) || 0;
  const sugerida = Math.round(valor * (sellerPercent / 100) * 100) / 100;
  const comissaoAtual = commissionTouched ? Number(commission) || 0 : sugerida;

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
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await settleInsuranceAction(saleId, accountId, valor, comissaoAtual);
              if (!r.ok) setError(r.error ?? "Não foi possível receber.");
              else setOpen(false);
            });
          }}
          className="rounded bg-blue-600 px-2 py-1 font-medium text-white disabled:opacity-50"
        >
          {pending ? "..." : "Confirmar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:underline">
          Cancelar
        </button>
      </div>
      {error ? <p className="text-rose-600">{error}</p> : null}
    </div>
  );
}
