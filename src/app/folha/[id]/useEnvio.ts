"use client";

import { useState, useTransition, type FormEvent } from "react";

type Resultado = { error?: string; ok?: string };

/**
 * Envio dos formulários da ficha: espera a resposta da ação e, dando certo,
 * recarrega a ficha com a confirmação (?ok=). Não depende do estado do
 * componente — a revalidação do Next às vezes recria o formulário no meio do
 * caminho — e, com erro, os campos ficam como estavam (sem reset do form).
 */
export function useEnvio(acao: (prev: Resultado, form: FormData) => Promise<Resultado>) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const aoEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      setErro(null);
      const r = await acao({}, dados);
      if (r.error) setErro(r.error);
      else window.location.assign(`${window.location.pathname}?ok=${encodeURIComponent(r.ok ?? "Salvo.")}`);
    });
  };
  return { erro, pendente, aoEnviar };
}
