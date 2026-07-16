"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { openCashboxAction, closeCashboxAction } from "./actions";

type Session = {
  id: string;
  workDate: Date;
  openedAt: Date;
  openedBy: string | null;
  closedAt: Date | null;
  closedBy: string | null;
};

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CashboxCard({
  open,
  session,
  history,
}: {
  open: boolean;
  session: Session | null;
  history: Session[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [workDate, setWorkDate] = useState(todayInput());

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
          {!open ? (
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

          {open ? (
            <button
              type="button"
              onClick={doClose}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              🔒 {pending ? "Fechando..." : "Fechar Caixa"}
            </button>
          ) : (
            <button
              type="button"
              onClick={doOpen}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              🔓 {pending ? (willReopen ? "Reabrindo..." : "Abrindo...") : willReopen ? "Reabrir Caixa" : "Abrir Caixa"}
            </button>
          )}
        </div>

        {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}

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
