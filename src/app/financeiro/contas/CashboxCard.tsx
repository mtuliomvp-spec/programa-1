"use client";

import { useState, useTransition } from "react";
import { formatCurrency, formatDate } from "@/lib/format";
import { openCashboxAction, closeCashboxAction, revertCashboxAction } from "./actions";
import { creditVehicleAdvanceAction } from "@/app/estoque/actions";

type Session = {
  id: string;
  workDate: Date;
  openedAt: Date;
  openedBy: string | null;
  closedAt: Date | null;
  closedBy: string | null;
};

type PendingAdvance = {
  id: string;
  amount: number;
  depositDate: Date;
  accountName: string | null;
  vehicleLabel: string | null;
  customerName: string | null;
};

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Data de trabalho (yyyy-mm-dd em UTC) para pré-preencher o Boletim de Caixa. */
function boletimDay(d: Date): string {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

export default function CashboxCard({
  open,
  session,
  history,
  canManage = true,
  pendingAdvances = [],
}: {
  open: boolean;
  session: Session | null;
  history: Session[];
  canManage?: boolean;
  /** Sinais aguardando crédito cuja data de depósito já chegou. */
  pendingAdvances?: PendingAdvance[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [workDate, setWorkDate] = useState(todayInput());
  const [reverting, startRevert] = useTransition();
  const [revertMsg, setRevertMsg] = useState<string | null>(null);
  const [crediting, startCredit] = useTransition();
  const [creditError, setCreditError] = useState<string | null>(null);

  function doCredit(id: string) {
    setCreditError(null);
    startCredit(async () => {
      const r = await creditVehicleAdvanceAction(id);
      if (!r.ok) setCreditError(r.error || "Não foi possível creditar o sinal.");
    });
  }

  // Reabrir = a última sessão está fechada e é do MESMO dia selecionado.
  const lastDay = session ? new Date(session.workDate).toISOString().slice(0, 10) : null;
  const willReopen = !open && !!session?.closedAt && lastDay === workDate;

  function doOpen() {
    setError(null);
    start(async () => {
      const r = await openCashboxAction(workDate);
      if (!r.ok) setError(r.error || "Erro ao abrir o caixa.");
    });
  }
  function doClose() {
    setError(null);
    start(async () => {
      const r = await closeCashboxAction();
      if (!r.ok) setError(r.error || "Erro ao fechar o caixa.");
    });
  }
  function doRevert() {
    setError(null);
    setRevertMsg(null);
    const dia = session ? formatDate(session.workDate) : "de hoje";
    if (
      !confirm(
        `Estornar TODOS os pagamentos e recebimentos do caixa ${dia}?\n\nOs títulos voltam a pendente e os lançamentos avulsos do dia são apagados. Baixas vindas de venda/recorrência não são tocadas (reverta na origem). Esta ação não pode ser desfeita em bloco.`,
      )
    ) {
      return;
    }
    startRevert(async () => {
      const r = await revertCashboxAction();
      if (!r.ok) {
        setError(r.error || "Erro ao estornar o caixa.");
        return;
      }
      const partes = [`${r.revertidos ?? 0} baixa(s) estornada(s)`];
      if (r.pulados) partes.push(`${r.pulados} de venda/recorrência mantida(s) — reverta na origem`);
      setRevertMsg(partes.join(" · "));
    });
  }

  return (
    <div
      className={`mb-4 overflow-hidden rounded-xl border-l-4 ${
        open ? "border-l-emerald-500 border border-emerald-200 bg-emerald-50/60" : "border-l-rose-500 border border-rose-200 bg-rose-50/60"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            {open ? "🔓" : "🔒"}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-lg font-bold ${open ? "text-emerald-800" : "text-rose-800"}`}>
              {open ? "Caixa Aberto" : "Caixa Fechado"}
            </p>
            {open && session ? (
              <p className="mt-0.5 text-sm text-slate-600">
                Data de trabalho: <strong>{formatDate(session.workDate)}</strong>
                {session.openedBy ? <> — Aberto por {session.openedBy}</> : null}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-rose-700">
                Os lançamentos estão <strong>bloqueados</strong>. Abra o caixa para operar.
                {session?.closedBy ? (
                  <span className="block text-slate-500">
                    Fechado por {session.closedBy} em {formatDate(session.closedAt ?? session.workDate)}.
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          {!open && canManage ? (
            <label className="text-xs font-medium text-slate-600">
              Data de trabalho
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="mt-1 block h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            🕘 Histórico
          </button>

          <a
            href="/financeiro/fechamento"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            📋 Fechamento Mensal
          </a>

          <a
            href={
              session
                ? `/financeiro/boletim-caixa?de=${boletimDay(session.workDate)}&ate=${boletimDay(session.workDate)}`
                : "/financeiro/boletim-caixa"
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            📄 Boletim de Caixa
          </a>

          {canManage && open ? (
            <>
              <button
                type="button"
                onClick={doRevert}
                disabled={reverting || pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                title="Volta todos os pagamentos e recebimentos do dia para pendente (e apaga os avulsos)"
              >
                ↺ {reverting ? "Estornando..." : "Estornar caixa do dia"}
              </button>
              <button
                type="button"
                onClick={doClose}
                disabled={pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                🔒 {pending ? "Fechando..." : "Fechar Caixa"}
              </button>
            </>
          ) : canManage && !open ? (
            <button
              type="button"
              onClick={doOpen}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              🔓 {pending ? (willReopen ? "Reabrindo..." : "Abrindo...") : willReopen ? "Reabrir Caixa" : "Abrir Caixa"}
            </button>
          ) : null}
        </div>

        {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
        {revertMsg ? <p className="mt-2 text-sm font-medium text-emerald-700">{revertMsg}</p> : null}

        {open && pendingAdvances.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              💰 Sinais / entradas antecipadas aguardando crédito
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              O cliente depositou (data já chegada) e o valor ainda não entrou no caixa. Confira e
              credite o que confirmar — entra na conta indicada, na data de trabalho de hoje.
            </p>
            <ul className="mt-2 space-y-1.5">
              {pendingAdvances.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{formatCurrency(a.amount)}</span>
                    {a.accountName ? <> · {a.accountName}</> : null}
                    {a.vehicleLabel ? <> · {a.vehicleLabel}</> : null}
                    {a.customerName ? <> · {a.customerName}</> : null}
                    <span className="block text-xs text-slate-500">
                      Depósito em {formatDate(a.depositDate)}
                    </span>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => doCredit(a.id)}
                      disabled={crediting}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {crediting ? "Creditando..." : "Creditar"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {creditError ? (
              <p className="mt-2 text-sm font-medium text-rose-600">{creditError}</p>
            ) : null}
          </div>
        ) : null}

        {showHistory ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Histórico de aberturas/fechamentos
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum registro ainda.</p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-auto text-sm">
                {history.map((s) => (
                  <li key={s.id} className="flex flex-col border-b border-slate-100 pb-1.5 last:border-0">
                    <span className="font-medium text-slate-800">
                      Dia {formatDate(s.workDate)}
                      {s.closedAt ? (
                        <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-700">fechado</span>
                      ) : (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700">aberto</span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      Aberto {formatDate(s.openedAt)}{s.openedBy ? ` por ${s.openedBy}` : ""}
                      {s.closedAt ? ` · Fechado ${formatDate(s.closedAt)}${s.closedBy ? ` por ${s.closedBy}` : ""}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
