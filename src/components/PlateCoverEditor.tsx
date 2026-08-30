"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type Rect = { x: number; y: number; w: number; h: number }; // frações 0..1

const MAX_SIDE = 1600;

/**
 * Editor para COBRIR A PLACA de uma foto: o usuário arrasta uma ou mais tarjas
 * sobre a placa; ao salvar, a imagem é redesenhada no navegador com as tarjas
 * pretas e substitui a foto original. Assim dá para encaminhar as fotos a
 * interessados (ou publicar na vitrine) sem expor a placa.
 *
 * Componente genérico: quem usa diz de ONDE vem a imagem (`imageUrl`) e o que
 * fazer com o arquivo gerado (`onSave`, que devolve a mensagem de erro ou null).
 * É usado tanto nas fotos da avaliação quanto nas fotos do veículo do estoque.
 */
export default function PlateCoverEditor({
  imageUrl,
  onClose,
  onSave,
  onSaved,
}: {
  imageUrl: string;
  onClose: () => void;
  onSave: (file: File) => Promise<string | null>;
  onSaved: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } | null {
    const el = surfaceRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (saving) return;
    const p = pointFromEvent(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const p = pointFromEvent(e);
    if (!p) return;
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function onPointerUp() {
    if (draft && draft.w > 0.01 && draft.h > 0.01) {
      setRects((r) => [...r, draft]);
    }
    setDraft(null);
    startRef.current = null;
  }

  async function handleSave() {
    if (rects.length === 0) {
      setError("Arraste uma tarja sobre a placa antes de salvar.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const img = document.createElement("img");
      img.src = imageUrl;
      await img.decode();
      const natW = img.naturalWidth || 1;
      const natH = img.naturalHeight || 1;
      const scale = Math.min(1, MAX_SIDE / Math.max(natW, natH));
      const cw = Math.max(1, Math.round(natW * scale));
      const ch = Math.max(1, Math.round(natH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Não foi possível processar a imagem neste dispositivo.");
        setSaving(false);
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.fillStyle = "#000000";
      for (const r of rects) {
        ctx.fillRect(r.x * cw, r.y * ch, r.w * cw, r.h * ch);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (!blob) {
        setError("Não foi possível gerar a imagem.");
        setSaving(false);
        return;
      }

      const file = new File([blob], "foto-placa-coberta.jpg", { type: "image/jpeg" });
      const erro = await onSave(file);
      if (erro) {
        setError(erro);
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Não foi possível abrir a imagem. Tente novamente.");
      setSaving(false);
    }
  }

  const shown = draft ? [...rects, draft] : rects;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Cobrir a placa</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <p className="mb-3 text-xs text-slate-500">
            Arraste o dedo (ou o mouse) sobre a placa para criar uma tarja preta. Você pode aplicar
            mais de uma. Ao salvar, a foto passa a ficar com a placa coberta.
          </p>

          <div
            ref={surfaceRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative mx-auto block w-full touch-none select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Foto do veículo"
              draggable={false}
              className="block w-full select-none"
            />
            {shown.map((r, i) => (
              <div
                key={i}
                className="absolute bg-black"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              />
            ))}
          </div>

          {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRects((r) => r.slice(0, -1))}
              disabled={saving || rects.length === 0}
            >
              Desfazer tarja
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRects([])}
              disabled={saving || rects.length === 0}
            >
              Limpar
            </Button>
          </div>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar com a placa coberta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
