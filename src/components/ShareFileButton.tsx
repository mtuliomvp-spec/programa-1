"use client";

import { useState } from "react";

/** Celular/tablet? (inclui iPad que se apresenta como Mac, mas tem toque) */
function isMobileDevice(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile != null) return nav.userAgentData.mobile;
  const ua = navigator.userAgent;
  return /android|iphone|ipad|ipod/i.test(ua) || (/mac/i.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * "Enviar" um arquivo pelo WhatsApp:
 * - CELULAR: folha de compartilhamento nativa (Web Share) — o arquivo vai
 *   anexado direto na conversa.
 * - COMPUTADOR: nenhum navegador consegue anexar arquivo direto no WhatsApp, e
 *   a folha do Windows costuma falhar/não listar o WhatsApp (o clique "expira"
 *   após o fetch e o share é recusado, deixando o botão pendurado). Então no
 *   desktop nem tenta o share: baixa o arquivo e abre o WhatsApp (app se
 *   registrado + WhatsApp Web) para anexar pelo clipe.
 */
export default function ShareFileButton({
  url,
  filename,
  label = "📤 Enviar",
}: {
  /** URL same-origin do arquivo (ex.: /financeiro/a-pagar/anexos/<id>). */
  url: string;
  filename: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  function desktopFallback(blob: Blob) {
    // Baixa o arquivo…
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "arquivo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // …tenta o aplicativo do WhatsApp (protocolo registrado)…
    try {
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.src = "whatsapp://send";
      document.body.appendChild(frame);
      setTimeout(() => frame.remove(), 2000);
    } catch {
      /* protocolo não registrado — segue o Web */
    }
    // …e abre o WhatsApp Web, que funciona sempre.
    window.open("https://web.whatsapp.com", "_blank", "noopener");
    alert("Arquivo baixado. No WhatsApp, abra a conversa e anexe-o pelo clipe 📎 (pasta Downloads).");
  }

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      const file = new File([blob], filename || "arquivo", {
        type: blob.type || "application/octet-stream",
      });
      const canNativeShare =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

      if (isMobileDevice() && canNativeShare) {
        try {
          await navigator.share({ files: [file] });
        } catch (e) {
          // AbortError = usuário fechou a folha (não é erro). Qualquer outra
          // falha (gesto expirado, folha indisponível) cai no plano B.
          if (!(e instanceof DOMException && e.name === "AbortError")) desktopFallback(blob);
        }
      } else {
        desktopFallback(blob);
      }
    } catch {
      alert("Não foi possível preparar o arquivo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      title="Enviar pelo WhatsApp"
      className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
    >
      {busy ? "Preparando…" : label}
    </button>
  );
}
