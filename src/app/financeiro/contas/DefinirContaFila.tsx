"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirContaDaFilaAction } from "./actions";
import type { PagamentoNaFila } from "@/lib/payment-queue";

/**
 * Pré-lançamento que entrou SEM conta (o comprovante não a identificou):
 * escolhe a conta aqui mesmo, sem esperar o ok do caixa — e o previsto da
 * conta passa a contar com ele.
 */
export default function DefinirContaFila({
  kind,
  ids,
  direcao,
  accounts,
}: {
  kind: PagamentoNaFila["kind"];
  ids: string[];
  direcao: PagamentoNaFila["direcao"];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function salvar() {
    setErro(null);
    start(async () => {
      const r = await definirContaDaFilaAction({ kind, ids, accountId });
      if (!r.ok) {
        setErro(r.error || "Não foi possível definir a conta.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
      {direcao === "entrada" ? "Conta creditada" : "Conta debitada"}
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="h-8 w-56 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900"
      >
        <option value="">Escolha a conta…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={salvar}
        disabled={!accountId || pending}
        className="h-8 rounded-lg bg-slate-900 px-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Salvar conta"}
      </button>
      {erro ? <span className="text-rose-600">{erro}</span> : null}
    </div>
  );
}
