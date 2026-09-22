"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trocarFinanceiraAction } from "./actions";

type Financeira = { id: string; name: string };

/**
 * Troca a financeira de uma venda já registrada, ali na linha.
 *
 * A financeira errada só aparece depois — quando o retorno não cai, ou quando
 * alguém confere o contrato. Antes disso, a saída era cancelar a operação e
 * registrar de novo, o que esbarra na data do caixa e refaz lançamentos que
 * estavam certos. Aqui o que muda é só de quem a loja tem a receber.
 */
export default function TrocarFinanceira({
  saleId,
  atualId,
  financeiras,
}: {
  saleId: string;
  atualId: string;
  financeiras: Financeira[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escolhida, setEscolhida] = useState("");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const outras = financeiras.filter((f) => f.id !== atualId);
  if (outras.length === 0) return null;

  function salvar() {
    setErro(null);
    setAvisos([]);
    start(async () => {
      const r = await trocarFinanceiraAction(saleId, escolhida);
      if (!r.ok) {
        setErro(r.error || "Não foi possível trocar.");
        return;
      }
      setAberto(false);
      setAvisos(r.avisos ?? []);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-0.5 block text-[11px] font-medium text-blue-700 hover:underline"
          title="A venda saiu por outra financeira? Corrija aqui."
        >
          trocar financeira
        </button>
        {avisos.length ? (
          <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-slate-300 bg-white p-2">
      <p className="text-[11px] text-slate-600">
        O repasse, o retorno e as baixas já feitas mudam para a financeira escolhida.{" "}
        <strong>Valores e datas não mudam</strong> — só de quem a loja tem a receber.
      </p>
      <select
        value={escolhida}
        onChange={(e) => setEscolhida(e.target.value)}
        className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
      >
        <option value="">Escolha a financeira certa…</option>
        {outras.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pending || !escolhida}
          className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Trocando…" : "Trocar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          disabled={pending}
          className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Voltar
        </button>
      </div>
      {erro ? <p className="mt-1 text-[11px] text-rose-600">{erro}</p> : null}
    </div>
  );
}
