"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import type { BooksHealth } from "@/lib/books-health";
import { fixUnattributedBaixasAction } from "@/app/financeiro/contas/actions";

/**
 * Os dois "checks" de integridade do financeiro (estilo Agrasty), verde/vermelho.
 * Quando vermelho, o sistema bloqueia novos lançamentos até corrigir.
 */
export default function BooksHealthChecks({ health }: { health: BooksHealth }) {
  const { check1, check2 } = health;
  const [open1, setOpen1] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleFix() {
    setMsg(null);
    start(async () => {
      const r = await fixUnattributedBaixasAction();
      if (r.error) setMsg(r.error);
      else setMsg(`${r.fixed ?? 0} lançamento(s) atribuído(s) à conta padrão. Recarregue a página.`);
    });
  }

  return (
    <div className="mb-4 space-y-2">
      {/* Check 1 */}
      <div
        className={`rounded-xl border px-4 py-3 ${
          check1.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className={`flex items-start gap-2 text-sm font-medium ${check1.ok ? "text-emerald-800" : "text-rose-800"}`}>
            <span aria-hidden>{check1.ok ? "✅" : "⚠️"}</span>
            {check1.ok
              ? "Os saldos totais (Contas Financeiras × Caixa Geral × Extrato) estão convergentes"
              : "Os saldos totais (Contas × Caixa × Extrato) estão divergentes"}
          </p>
          <button
            type="button"
            onClick={() => setOpen1((v) => !v)}
            className="shrink-0 text-xs font-medium text-slate-500 hover:underline"
          >
            {open1 ? "Ocultar" : "Ver fontes"}
          </button>
        </div>

        {open1 || !check1.ok ? (
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <div className="flex justify-between gap-3">
              <span>Contas financeiras</span>
              <span className="tabular-nums">{formatCurrency(check1.contasTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Caixa geral</span>
              <span className="tabular-nums">{formatCurrency(check1.caixaGeral)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Extrato (inclui baixas sem conta)</span>
              <span className="tabular-nums">{formatCurrency(check1.extrato)}</span>
            </div>
            {!check1.ok ? (
              <>
                <div className="mt-2 rounded-md border border-rose-200 bg-white p-2">
                  <p className="mb-1 font-semibold text-rose-700">
                    Dinheiro sem conta financeira: {formatCurrency(check1.baixasSemConta)}
                  </p>
                  <ul className="max-h-40 space-y-0.5 overflow-auto">
                    {check1.itens.map((it, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">
                          {it.tipo === "entrada" ? "＋" : "－"} {it.descricao}
                        </span>
                        <span className="tabular-nums">{formatCurrency(it.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={handleFix}
                  disabled={pending}
                  className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {pending ? "Corrigindo..." : "Corrigir: atribuir à conta padrão"}
                </button>
                {msg ? <p className="mt-1 text-xs font-medium text-slate-700">{msg}</p> : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Check 2 */}
      <div
        className={`rounded-xl border px-4 py-3 ${
          check2.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"
        }`}
      >
        <p className={`flex items-start gap-2 text-sm font-medium ${check2.ok ? "text-emerald-800" : "text-rose-800"}`}>
          <span aria-hidden>{check2.ok ? "✅" : "⚠️"}</span>
          {check2.ok
            ? "Os saldos de Lucro/Prejuízo estão corretos"
            : `Os saldos de Lucro/Prejuízo estão divergentes (diferença de ${formatCurrency(Math.abs(check2.diff))})`}
        </p>
      </div>

      {!health.allOk ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          🔒 Novos lançamentos estão <strong>bloqueados</strong> até os saldos convergirem.
        </div>
      ) : null}
    </div>
  );
}
