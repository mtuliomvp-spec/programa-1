"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Galeria de fotos da vitrine com lightbox navegável. Ao tocar qualquer foto,
 * abre em tela cheia e o cliente passa para a próxima/anterior por setas
 * (desktop), teclado ou arrasto (swipe no celular) — sem precisar voltar.
 */
export default function VitrineGallery({
  photoIds,
  title,
}: {
  photoIds: string[];
  title: string;
}) {
  const total = photoIds.length;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const prev = useCallback(
    () => setOpenIndex((i) => (i === null ? i : (i - 1 + total) % total)),
    [total],
  );
  const next = useCallback(
    () => setOpenIndex((i) => (i === null ? i : (i + 1) % total)),
    [total],
  );

  const isOpen = openIndex !== null;

  // Teclado (desktop) + trava do scroll do fundo enquanto o lightbox está aberto.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close, prev, next]);

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      if (delta < 0) next();
      else prev();
    }
    touchStartX.current = null;
  }

  return (
    <>
      {/* Grade na página: foto grande + miniaturas, todas abrem o lightbox */}
      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => setOpenIndex(0)}
          className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
          aria-label="Ampliar foto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/vitrine/foto/${photoIds[0]}`} alt={title} className="w-full object-cover" />
        </button>
        {total > 1 ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photoIds.slice(1).map((pid, i) => (
              <button
                key={pid}
                type="button"
                onClick={() => setOpenIndex(i + 1)}
                className="cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800"
                aria-label={`Ampliar foto ${i + 2}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/vitrine/foto/${pid}`}
                  alt={title}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Lightbox em tela cheia */}
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={close}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="true"
        >
          {/* Barra superior: contador + fechar */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            {total > 1 ? (
              <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white">
                {(openIndex as number) + 1} / {total}
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/vitrine/foto/${photoIds[openIndex as number]}`}
            alt={title}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[92vw] object-contain select-none"
          />

          {total > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-2 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl text-white hover:bg-white/25 sm:left-4"
                aria-label="Foto anterior"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-2 top-1/2 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl text-white hover:bg-white/25 sm:right-4"
                aria-label="Próxima foto"
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
