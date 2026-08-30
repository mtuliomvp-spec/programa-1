"use client";

import { useEffect, useRef } from "react";
import { registrarVisitaAction } from "../actions";

/**
 * Avisa o servidor que este anúncio foi aberto. Fica no navegador (e não no
 * render do servidor) de propósito: assim só conta quem realmente abriu a
 * página, sem robô de busca e sem o pré-carregamento de link que o navegador
 * faz sozinho. Não desenha nada na tela.
 */
export default function RegistraVisita({ alvo }: { alvo: string }) {
  const jaContou = useRef(false);

  useEffect(() => {
    if (jaContou.current) return;
    jaContou.current = true;
    void registrarVisitaAction(alvo);
  }, [alvo]);

  return null;
}
