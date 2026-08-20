"use client";

import { useState } from "react";

/**
 * "Enviar" um arquivo pelo compartilhamento nativo (Web Share): no celular abre
 * a folha do sistema com WhatsApp/e-mail etc. — é o caminho para mandar um
 * anexo (boleto, NF, comprovante) direto no WhatsApp. Onde o navegador não
 * suporta compartilhar arquivos (desktop antigo), cai no download com aviso.
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

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      const file = new File([blob], filename || "arquivo", {
        type: blob.type || "application/octet-stream",
      });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        // Celular (e Windows com folha de compartilhamento): abre a folha do
        // sistema com o WhatsApp — o arquivo vai anexado direto.
        try {
          await navigator.share({ files: [file] });
        } catch {
          // usuário cancelou a folha de compartilhamento — não é erro
        }
      } else {
        // Computador sem folha de compartilhamento: nenhum navegador consegue
        // anexar arquivo direto no WhatsApp. Fluxo mais curto possível: baixa o
        // arquivo E abre o WhatsApp (o app, se instalado; senão o WhatsApp Web)
        // — é só anexar na conversa (clipe 📎) a partir de Downloads.
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || "arquivo";
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Tenta o aplicativo do WhatsApp (protocolo registrado); em paralelo
        // abre o WhatsApp Web, que funciona sempre e ainda oferece o app.
        try {
          const frame = document.createElement("iframe");
          frame.style.display = "none";
          frame.src = "whatsapp://send";
          document.body.appendChild(frame);
          setTimeout(() => frame.remove(), 2000);
        } catch {
          /* protocolo não registrado — segue o Web */
        }
        window.open("https://web.whatsapp.com", "_blank", "noopener");
        alert("Arquivo baixado. No WhatsApp, abra a conversa e anexe-o pelo clipe 📎 (pasta Downloads).");
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
      title="Compartilhar (WhatsApp, e-mail…)"
      className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
    >
      {busy ? "Preparando…" : label}
    </button>
  );
}
