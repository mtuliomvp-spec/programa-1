"use client";

import { useState } from "react";
import { marcarAvaliacaoPedidaAction } from "./avaliacao-actions";

/**
 * "⭐ Pedir avaliação no Google": abre o WhatsApp do comprador com a mensagem
 * pronta e o link de avaliação da loja, e marca na venda quando foi pedido.
 * O WhatsApp abre na hora do clique (antes de qualquer espera), senão o
 * navegador bloqueia a nova aba.
 */
export default function PedirAvaliacao({
  saleId,
  link,
  pedidoEm,
  semLink,
}: {
  saleId: string;
  /** wa.me do comprador com a mensagem; null = cliente sem telefone. */
  link: string | null;
  /** Data (dd/mm/aaaa) do último pedido, se já foi feito. */
  pedidoEm: string | null;
  /** A loja ainda não cadastrou o link de avaliação em Parâmetros. */
  semLink: boolean;
}) {
  const [enviado, setEnviado] = useState<string | null>(pedidoEm);

  if (semLink) {
    return (
      <span className="text-xs text-slate-500" title="Parâmetros › Google › Link para avaliar a loja no Google">
        ⭐ Avaliação no Google: cadastre o link em Parâmetros
      </span>
    );
  }
  if (!link) {
    return <span className="text-xs text-slate-500">⭐ Avaliação no Google: cliente sem telefone no cadastro</span>;
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          setEnviado(new Date().toLocaleDateString("pt-BR"));
          void marcarAvaliacaoPedidaAction(saleId);
        }}
        className="inline-flex h-10 items-center rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
      >
        ⭐ {enviado ? "Pedir avaliação de novo" : "Pedir avaliação no Google"}
      </a>
      {enviado ? <span className="text-[11px] text-slate-500">Pedido enviado em {enviado}</span> : null}
    </span>
  );
}
