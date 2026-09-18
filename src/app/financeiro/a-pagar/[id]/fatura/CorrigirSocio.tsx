"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { corrigirSocioDoLancamentoAction } from "./actions";

type Option = { id: string; name: string };

/**
 * Troca o sócio de um lançamento de fatura do fluxo Capital direto na lista —
 * o único jeito de corrigir uma despesa pessoal marcada no sócio errado depois
 * que a fatura já foi paga (a tela de edição do título não abre mais).
 */
export default function CorrigirSocio({
  itemId,
  atualId,
  beneficiaries,
}: {
  itemId: string;
  atualId: string | null;
  beneficiaries: Option[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState(atualId ?? "");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    setErro(null);
    start(async () => {
      const r = await corrigirSocioDoLancamentoAction(itemId, escolhido);
      if (!r.ok) {
        setErro(r.error || "Não foi possível corrigir.");
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="print:hidden ml-2 text-xs font-medium text-blue-700 hover:underline"
        title="Este lançamento está debitado no capital do sócio errado?"
      >
        trocar
      </button>
    );
  }

  return (
    <span className="print:hidden mt-1 block">
      <select
        value={escolhido}
        onChange={(e) => setEscolhido(e.target.value)}
        className="h-8 max-w-[220px] rounded-lg border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="">Escolha o sócio…</option>
        {beneficiaries.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={salvar}
        disabled={pending || !escolhido || escolhido === atualId}
        className="ml-2 h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        disabled={pending}
        className="ml-1 h-8 px-2 text-xs font-medium text-slate-500 hover:underline disabled:opacity-50"
      >
        cancelar
      </button>
      <span className="mt-1 block text-[11px] text-slate-500">
        Não mexe em dinheiro: o valor, a data e a conta do pagamento continuam os mesmos — só muda de
        quem é a retirada de capital.
      </span>
      {erro ? <span className="mt-1 block text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
