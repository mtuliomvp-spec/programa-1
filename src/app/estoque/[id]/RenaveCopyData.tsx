"use client";

import { useState } from "react";

/** `secao`: título que abre um grupo (ex.: a tela seguinte do formulário). */
export type CampoRenave = { rotulo: string; valor: string | null; dica?: string; secao?: string };

/**
 * "Copiar dados para o ControlStock": enquanto a integradora não libera a API,
 * o registro no Renave é feito no painel dela. Aqui fica tudo o que o painel
 * pede, campo a campo (cada um com o seu "copiar", porque lá são campos
 * separados) e o bloco inteiro de uma vez. O que falta aparece marcado.
 */
export default function RenaveCopyData({ entrada, saida }: { entrada: CampoRenave[]; saida: CampoRenave[] | null }) {
  const [aberto, setAberto] = useState<"entrada" | "saida" | null>(null);

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <p className="text-sm font-semibold text-slate-900">📋 Copiar dados para o ControlStock</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Abra o registro no painel da integradora e cole campo a campo. Depois de registrar, volte aqui e
        informe o protocolo no formulário do Renave acima.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAberto(aberto === "entrada" ? null : "entrada")}
          className={`h-8 rounded-lg px-3 text-xs font-semibold ${aberto === "entrada" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          Registro de ENTRADA
        </button>
        {saida ? (
          <button
            type="button"
            onClick={() => setAberto(aberto === "saida" ? null : "saida")}
            className={`h-8 rounded-lg px-3 text-xs font-semibold ${aberto === "saida" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Registro de SAÍDA (venda)
          </button>
        ) : null}
      </div>
      {aberto === "entrada" ? <Bloco titulo="Entrada no estoque" campos={entrada} /> : null}
      {aberto === "saida" && saida ? <Bloco titulo="Saída (venda)" campos={saida} /> : null}
    </div>
  );
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Navegador sem permissão de área de transferência: campo temporário.
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(campo);
    return ok;
  }
}

function Bloco({ titulo, campos }: { titulo: string; campos: CampoRenave[] }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const faltando = campos.filter((c) => !c.valor).length;

  async function copiar(chave: string, texto: string) {
    if (await copiarTexto(texto)) {
      setCopiado(chave);
      setTimeout(() => setCopiado((c) => (c === chave ? null : c)), 2000);
    }
  }

  const tudo = campos.map((c) => `${c.rotulo}: ${c.valor ?? "—"}`).join("\n");

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <button
          type="button"
          onClick={() => copiar("__tudo__", tudo)}
          className="h-7 rounded-lg bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-700"
        >
          {copiado === "__tudo__" ? "✓ Copiado" : "Copiar tudo"}
        </button>
      </div>
      {faltando > 0 ? (
        <p className="mt-1 text-[11px] text-amber-700">
          ⚠ {faltando} dado(s) em falta — complete na ficha (Editar / formulário do Renave) antes de registrar.
        </p>
      ) : null}
      <ul className="mt-2 divide-y divide-slate-200">
        {campos.map((c) => (
          <li key={c.rotulo} className="py-1.5 text-sm">
            {c.secao ? (
              <p className="mb-1 mt-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">{c.secao}</p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[11px] text-slate-500">{c.rotulo}</span>
                {c.valor ? (
                  <span className="block break-all font-medium text-slate-900">{c.valor}</span>
                ) : (
                  <span className="block text-xs font-medium text-amber-700">falta{c.dica ? ` — ${c.dica}` : ""}</span>
                )}
              </span>
              {c.valor ? (
                <button
                  type="button"
                  onClick={() => copiar(c.rotulo, c.valor!)}
                  className="shrink-0 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                >
                  {copiado === c.rotulo ? "✓" : "📋 Copiar"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
