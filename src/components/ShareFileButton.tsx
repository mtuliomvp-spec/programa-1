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
        try {
          await navigator.share({ files: [file] });
        } catch {
          // usuário cancelou a folha de compartilhamento — não é erro
        }
      } else {
        alert(
          "Este navegador não permite compartilhar arquivos direto. O arquivo será baixado — anexe-o no WhatsApp.",
        );
        window.open(`${url}${url.includes("?") ? "&" : "?"}download=1`, "_blank");
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
