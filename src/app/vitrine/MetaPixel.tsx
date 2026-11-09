"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Pixel da Meta na vitrine pública: PageView em toda página e o LEAD em todo
 * clique num link de WhatsApp ou telefone (o mesmo critério das tags do
 * Google). O ID chega validado nos Parâmetros (só números), por isso pode ir
 * no script inline.
 */
export default function MetaPixel({ pixelId }: { pixelId: string | null }) {
  useEffect(() => {
    if (!pixelId) return;
    function aoClicar(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href") || "";
      const whatsapp = /wa\.me|whatsapp\.com/i.test(href);
      const telefone = href.startsWith("tel:");
      if ((!whatsapp && !telefone) || !window.fbq) return;
      window.fbq("track", "Lead", { content_category: whatsapp ? "whatsapp" : "telefone" });
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [pixelId]);

  if (!pixelId) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  );
}

/**
 * ViewContent do anúncio de um carro, com o MESMO id do catálogo: é o que liga
 * a visita ao item e permite à Meta mostrar o carro a quem já se interessou.
 * Espera o pixel carregar (o script entra depois da hidratação).
 */
export function MetaViewContent({ id, nome, valor }: { id: string; nome: string; valor: number | null }) {
  useEffect(() => {
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas++;
      if (window.fbq) {
        window.fbq("track", "ViewContent", {
          content_ids: [id],
          content_type: "product",
          content_name: nome,
          ...(valor ? { value: valor, currency: "BRL" } : {}),
        });
        clearInterval(timer);
      } else if (tentativas > 20) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [id, nome, valor]);
  return null;
}
