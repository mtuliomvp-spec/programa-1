"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bloco, type CampoRenave } from "./RenaveCopyData";
import { readAtpvAttachmentAction } from "../actions";

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
  temAtpv,
  atpvParaLer,
  podeLerAtpv,
}: {
  campos: CampoRenave[];
  /** Data (dd/mm/aaaa) do comprovante já anexado, se houver. */
  enviada: string | null;
  /** Há ATPV-e anexada no veículo. */
  temAtpv: boolean;
  /** ATPV-e anexada que ainda não foi lida (anexo antigo): o quadro oferece ler. */
  atpvParaLer: string | null;
  podeLerAtpv: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(!enviada);
  const [lendo, startLeitura] = useTransition();
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  function lerAtpv() {
    if (!atpvParaLer) return;
    setErroLeitura(null);
    startLeitura(async () => {
      const r = await readAtpvAttachmentAction(atpvParaLer);
      if (r.error) setErroLeitura(r.error);
      router.refresh();
    });
  }
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
      {aberto && !temAtpv ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Anexe a <strong>ATPV-e da venda</strong> no card ATPV-e: o sistema lê o documento e completa este quadro
          (número do CRV, CPF/CNPJ do vendedor, endereço do comprador e valor declarado).
        </p>
      ) : null}
      {aberto && atpvParaLer ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <span>Há uma ATPV-e anexada que ainda não foi lida.</span>
          {podeLerAtpv ? (
            <button
              type="button"
              onClick={lerAtpv}
              disabled={lendo}
              className="rounded-lg bg-indigo-700 px-2.5 py-1 font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {lendo ? "Lendo…" : "🤖 Ler agora e completar"}
            </button>
          ) : null}
          {erroLeitura ? <span className="text-rose-700">{erroLeitura}</span> : null}
        </div>
      ) : null}
      {aberto ? <Bloco titulo="Dados da comunicação" campos={campos} aviso="complete o cadastro antes de comunicar" /> : null}
    </div>
  );
}
