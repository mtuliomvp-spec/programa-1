"use client";

import { useState } from "react";

/**
 * Compartilhar anúncio: usa o compartilhamento nativo do celular quando
 * disponível (WhatsApp, Instagram, etc.); no computador abre o WhatsApp Web
 * com a mensagem pronta (título + link — o link vira card com foto e preço).
 */
export default function ShareButton({
  title,
  text,
  url,
  compact = false,
}: {
  title: string;
  text: string;
  url: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function share() {
    if (pending) return;
    const full = `${text} ${url}`.trim();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setPending(true);
      try {
        await navigator.share({ title, text, url });
      } catch {
        // usuário cancelou o compartilhamento — nada a fazer
      } finally {
        setPending(false);
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, "_blank", "noopener,noreferrer");
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void share();
        }}
        aria-label="Compartilhar anúncio"
        title="Compartilhar"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-base shadow ring-1 ring-slate-200 hover:bg-white"
      >
        📤
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-base font-semibold text-slate-700 hover:bg-slate-100"
    >
      📤 Compartilhar
    </button>
  );
}
