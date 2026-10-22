"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { payComboAction } from "../combos/actions";

type Account = { id: string; name: string };

export type SolicitedCombo = {
  id: string;
  name: string;
  userName: string | null;
  count: number;
  total: number;
  /** Parte do total que cobre o saldo devedor de capital do beneficiário (vira aporte). */
  abate: number;
  /** O que sai do banco: total − abate. */
  liquido: number;
  beneficiaryName: string | null;
  /**
   * Pré-lançado: o comprovante do borderô já chegou (o dinheiro saiu do banco)
   * e a baixa espera o movimento do caixa alcançar o dia, em Contas e caixas.
   */
  queued: { date: string; amount: number } | null;
};

/**
 * Combos aguardando pagamento como pagamento ÚNICO no Contas a pagar: os
 * títulos deles saem da tabela individual e são quitados todos de uma vez
 * por aqui (mesma ação do borderô, com abatimento de saldo devedor etc.).
 */
export default function SolicitedCombosCard({
  combos,
  accounts,
  canPay,
  cashboxDate,
}: {
  combos: SolicitedCombo[];
  accounts: Account[];
  canPay: boolean;
  cashboxDate: string | null;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [paying, startPay] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (combos.length === 0) return null;

  function pay(comboId: string) {
    setMsg(null);
    startPay(async () => {
      const r = await payComboAction(comboId, accountId);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível pagar o combo.");
        return;
      }
      setConfirming(null);
      setMsg("Combo pago — todos os títulos foram quitados.");
      router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
      <p className="text-sm font-semibold text-violet-900">🧺 Combos aguardando pagamento</p>
      <p className="mt-0.5 text-xs text-violet-700">
        Os títulos destes combos não aparecem na lista abaixo: cada combo é pago de uma vez só
        (aqui ou pelo borderô).
      </p>
      <div className="mt-3 space-y-2">
        {combos.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white px-4 py-3"
          >
            <div>
              <Link
                href={`/financeiro/combos/${c.id}`}
                className="font-medium text-violet-800 hover:underline"
              >
                {c.name}
              </Link>
              <p className="text-xs text-slate-500">
                {c.userName ? `Solicitado por ${c.userName} · ` : ""}
                {c.count} {c.count === 1 ? "título" : "títulos"}
              </p>
              {c.queued ? (
                <p
                  className="mt-0.5 text-xs font-medium text-amber-700"
                  title="O comprovante já chegou. A baixa é confirmada em Contas e caixas, quando o movimento alcançar o dia do pagamento."
                >
                  ⏳ pré-lançado · {formatCurrency(c.queued.amount)} em {formatDate(c.queued.date)}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {c.abate > 0.005 ? (
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    Total dos títulos <span className="tabular-nums">{formatCurrency(c.total)}</span>
                  </p>
                  <p className="text-xs text-amber-700">
                    − <span className="tabular-nums">{formatCurrency(c.abate)}</span> saldo devedor
                    {c.beneficiaryName ? ` de ${c.beneficiaryName}` : ""} (vira aporte)
                  </p>
                  <p className="text-base font-bold text-slate-900">
                    <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Líquido a pagar
                    </span>
                    <span className="tabular-nums">{formatCurrency(c.liquido)}</span>
                  </p>
                </div>
              ) : (
                <p className="text-base font-bold text-slate-900">{formatCurrency(c.total)}</p>
              )}
              <Link
                href={`/financeiro/combos/${c.id}`}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Ver borderô
              </Link>
              {canPay && accounts.length > 0 ? (
                confirming === c.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="basis-full text-xs font-medium text-slate-700 sm:basis-auto">
                      Sai da conta: <span className="tabular-nums">{formatCurrency(c.liquido)}</span>
                    </span>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={paying}
                      onClick={() => pay(c.id)}
                      className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {paying ? "Pagando..." : `Confirmar${cashboxDate ? ` (${cashboxDate})` : ""}`}
                    </button>
                    <button
                      type="button"
                      disabled={paying}
                      onClick={() => setConfirming(null)}
                      className="h-9 px-2 text-sm text-slate-500 hover:underline"
                    >
                      Voltar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMsg(null);
                      setConfirming(c.id);
                    }}
                    className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Pagar combo
                  </button>
                )
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {msg ? <p className="mt-2 text-sm text-slate-700">{msg}</p> : null}
    </div>
  );
}
