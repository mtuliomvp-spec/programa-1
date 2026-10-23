"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Tags do Google na vitrine pública (Google Ads e GA4) e a CONVERSÃO de lead:
 * todo clique num link de WhatsApp ou de telefone conta — é o contato que a
 * campanha quer gerar, e é com ele que o Google Ads aprende a quem mostrar o
 * anúncio. Escuta o documento inteiro, então vale para todo botão (card,
 * anúncio, flutuante, rodapé) sem cada um precisar saber disso.
 *
 * Os IDs chegam validados pelo formato nos Parâmetros (AW-…, G-…, rótulo
 * alfanumérico), por isso podem ir no script inline.
 */
export default function GoogleTags({
  adsId,
  leadLabel,
  analyticsId,
}: {
  adsId: string | null;
  leadLabel: string | null;
  analyticsId: string | null;
}) {
  const principal = adsId || analyticsId;

  useEffect(() => {
    if (!principal) return;
    function aoClicar(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href") || "";
      const whatsapp = /wa\.me|whatsapp\.com/i.test(href);
      const telefone = href.startsWith("tel:");
      if (!whatsapp && !telefone || !window.gtag) return;
      if (adsId && leadLabel) window.gtag("event", "conversion", { send_to: `${adsId}/${leadLabel}` });
      if (analyticsId) window.gtag("event", "generate_lead", { method: whatsapp ? "whatsapp" : "telefone" });
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [principal, adsId, leadLabel, analyticsId]);

  if (!principal) return null;
  const configs = [adsId, analyticsId].filter(Boolean).map((id) => `gtag('config','${id}');`).join("");
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${principal}`} strategy="afterInteractive" />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${configs}`}
      </Script>
    </>
  );
}
