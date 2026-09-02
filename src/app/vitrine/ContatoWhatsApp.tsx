"use client";

import type { ReactNode } from "react";
import { registrarVisitaAction } from "./actions";

/**
 * Link do WhatsApp de um anúncio que também marca a visita como CONTATO. O
 * link abre normalmente (nova aba / app do WhatsApp) e a marcação sai em
 * paralelo, sem segurar o clique nem depender de resposta do servidor.
 *
 * Existe porque o botão "Tenho interesse" do card da vitrine leva ao WhatsApp
 * sem abrir a página do anúncio — o único lugar que contava visita até então.
 */
export default function ContatoWhatsApp({
  href,
  alvo,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  /** Id do veículo ou da avaliação anunciada. */
  alvo: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        void registrarVisitaAction(alvo, true);
      }}
    >
      {children}
    </a>
  );
}
