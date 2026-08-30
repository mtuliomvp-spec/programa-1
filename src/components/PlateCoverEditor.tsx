"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type Rect = { x: number; y: number; w: number; h: number }; // frações 0..1 da imagem

const MAX_SIDE = 1600;
const ZOOM_MAX = 6;
const ZOOM_PASSO = 1;

/**
 * Editor para COBRIR A PLACA de uma foto: o usuário arrasta uma ou mais tarjas
 * sobre a placa; ao salvar, a imagem é redesenhada no navegador com as tarjas
 * pretas e substitui a foto original. Assim dá para encaminhar as fotos a
 * interessados (ou publicar na vitrine) sem expor a placa.
 *
 * Componente genérico: quem usa diz de ONDE vem a imagem (`imageUrl`) e o que
 * fazer com o arquivo gerado (`onSave`, que devolve a mensagem de erro ou null).
 * É usado tanto nas fotos da avaliação quanto nas fotos do veículo do estoque.
 *
 * ZOOM: na foto tirada de longe (o carro de lado, no pátio) a placa ocupa uns
 * poucos pixels na tela — o dedo cobre justamente o que se quer mirar e a tarja
 * sai torta. Por isso o editor amplia até 6×: aproxima-se a placa, arrasta-se a
 * tarja com folga e o retângulo continua sendo guardado em fração da IMAGEM,
 * não da tela. Ou seja, o zoom é só a lupa — não altera o que é salvo.
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
  const imagemRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  // Deslocamento em % do tamanho NÃO ampliado (o translate roda antes do scale).
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [modo, setModo] = useState<"tarja" | "mover">("tarja");
  const ampliado = zoom > 1;
  const movendo = ampliado && modo === "mover";

  /** Limite do deslocamento que ainda mantém a foto preenchendo a moldura. */
  function limitePan(z: number) {
    return 50 * (1 - 1 / z);
  }

  function aplicarZoom(novo: number) {
    const z = Math.min(ZOOM_MAX, Math.max(1, novo));
    const limite = limitePan(z);
    setZoom(z);
    setPan((atual) => ({
      x: Math.min(limite, Math.max(-limite, atual.x)),
      y: Math.min(limite, Math.max(-limite, atual.y)),
    }));
    if (z === 1) setModo("tarja");
  }

  /**
   * Ponto do evento em fração da IMAGEM. A conta usa o retângulo do elemento já
   * transformado (o navegador devolve a caixa depois do zoom e do arrasto), então
   * vale para qualquer ampliação sem matemática extra.
   */
  function pointFromEvent(e: React.PointerEvent): { x: number; y: number } | null {
    const el = imagemRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (saving) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (movendo) {
      panRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    const p = pointFromEvent(e);
    if (!p) return;
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (panRef.current) {
      const el = imagemRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // O arrasto na tela vira % do tamanho não ampliado (por isso divide pelo zoom).
      const dx = ((e.clientX - panRef.current.x) / rect.width) * 100;
      const dy = ((e.clientY - panRef.current.y) / rect.height) * 100;
      const limite = limitePan(zoom);
      setPan({
        x: Math.min(limite, Math.max(-limite, panRef.current.px + dx)),
        y: Math.min(limite, Math.max(-limite, panRef.current.py + dy)),
      });
      return;
    }
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
    panRef.current = null;
    // Com zoom, a tarja da placa é pequena em fração da imagem: o mínimo tem de
    // ser baixo o bastante para não descartar um retângulo legítimo.
    if (draft && draft.w > 0.004 && draft.h > 0.004) {
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
            {movendo
              ? "Arraste para posicionar a foto. Toque em “Tarja” para voltar a marcar."
              : "Arraste o dedo (ou o mouse) sobre a placa para criar uma tarja preta. Você pode aplicar mais de uma."}{" "}
            <b>Placa pequena?</b> Use o <b>+</b> para aproximar antes de marcar.
          </p>

          {/* Controles de zoom: sem eles, a placa de uma foto tirada de longe
              fica menor que o dedo e não há como mirar. */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300">
              <button
                type="button"
                onClick={() => aplicarZoom(zoom - ZOOM_PASSO)}
                disabled={saving || zoom <= 1}
                className="h-9 w-10 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Afastar"
              >
                −
              </button>
              <span className="w-14 border-x border-slate-200 text-center text-sm font-medium text-slate-700">
                {zoom}×
              </span>
              <button
                type="button"
                onClick={() => aplicarZoom(zoom + ZOOM_PASSO)}
                disabled={saving || zoom >= ZOOM_MAX}
                className="h-9 w-10 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Aproximar"
              >
                +
              </button>
            </div>

            {ampliado ? (
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-300">
                <button
                  type="button"
                  onClick={() => setModo("tarja")}
                  className={`h-9 px-3 text-sm font-medium ${
                    modo === "tarja" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Tarja
                </button>
                <button
                  type="button"
                  onClick={() => setModo("mover")}
                  className={`h-9 px-3 text-sm font-medium ${
                    modo === "mover" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Mover foto
                </button>
              </div>
            ) : null}

            {ampliado ? (
              <button
                type="button"
                onClick={() => {
                  aplicarZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Ver a foto inteira
              </button>
            ) : null}
          </div>

          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className={`relative mx-auto block w-full touch-none select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${
              movendo ? "cursor-grab" : "cursor-crosshair"
            }`}
          >
            <div
              ref={imagemRef}
              style={{
                transform: `scale(${zoom}) translate(${pan.x}%, ${pan.y}%)`,
                transformOrigin: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Foto do veículo"
                draggable={false}
                className="block w-full select-none"
              />
              {/* As tarjas ficam DENTRO do elemento ampliado: acompanham o zoom
                  e o arrasto sem recalcular nada. */}
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
