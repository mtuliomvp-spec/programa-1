"use client";

import { useState } from "react";
import { Bloco, type CampoRenave } from "./RenaveCopyData";

/** Endereço do formulário de comunicação de venda da prestadora (R30). */
export const R30_URL = "https://r30web.com.br/cv-br/index.jsf";

/**
 * "Comunicação de venda (R30)": a comunicação ao SENATRAN é feita no site da
 * prestadora, que não tem integração. Aqui fica tudo o que o formulário pede,
 * campo a campo, para copiar e colar — e o que falta no cadastro aparece antes
 * de abrir o site. O comprovante continua sendo anexado logo abaixo (é ele que
 * lança a cobrança da prestadora no carro).
 */
export default function ComunicacaoVendaCopy({
  campos,
  enviada,
}: {
  campos: CampoRenave[];
  /** Data (dd/mm/aaaa) do comprovante já anexado, se houver. */
  enviada: string | null;
}) {
  const [aberto, setAberto] = useState(!enviada);
  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">📨 Comunicação de venda (R30)</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAberto(!aberto)}
            className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {aberto ? "Esconder dados" : "Mostrar dados para copiar"}
          </button>
          <a
            href={R30_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
          >
            Abrir site da R30 ↗
          </a>
        </div>
      </div>
      {enviada ? (
        <p className="mt-1 text-xs font-medium text-emerald-700">✓ Comprovante da comunicação anexado em {enviada}.</p>
      ) : (
        <p className="mt-0.5 text-xs text-slate-500">
          Abra o site da R30 em outra aba e cole campo a campo. Depois de enviar, anexe o comprovante aqui embaixo —
          a cobrança da R30 entra sozinha no custo deste carro.
        </p>
      )}
      {aberto ? <Bloco titulo="Dados da comunicação" campos={campos} aviso="complete o cadastro antes de comunicar" /> : null}
    </div>
  );
}
