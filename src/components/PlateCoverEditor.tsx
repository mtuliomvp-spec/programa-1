"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

type Ponto = { x: number; y: number }; // frações 0..1 da imagem
type Poligono = Ponto[];

const MAX_SIDE = 1600;
const ZOOM_MAX = 6;
const ZOOM_PASSO = 1;
const CANTOS = 4;
/** Movimento acima disso (em px de tela) é arrasto para mover a foto, não toque. */
const TOQUE_MAX_PX = 8;

/**
 * Editor para COBRIR A PLACA de uma foto: o usuário toca nos QUATRO CANTOS da
 * placa e o sistema pinta exatamente aquele quadrilátero. Ao salvar, a imagem é
 * redesenhada no navegador com as tarjas e substitui a foto original.
 *
 * Por que quatro toques, e não um retângulo arrastado: a placa quase nunca está
 * de frente. Na foto do carro de lado ela aparece inclinada e em perspectiva —
 * um retângulo reto grande o bastante para tapar a placa inteira acaba
 * invadindo o para-choque e fica feio. Marcando canto a canto, a tarja tem a
 * forma da placa e cobre só ela.
 *
 * ZOOM: de longe a placa ocupa poucos pixels na tela. O editor amplia até 6×;
 * o arrasto move a foto e o toque marca o canto. O zoom é só lupa — os pontos
 * são guardados em fração da IMAGEM, então o que é salvo não muda.
 *
 * Componente genérico: quem usa diz de ONDE vem a imagem (`imageUrl`) e o que
 * fazer com o arquivo gerado (`onSave`, que devolve a mensagem de erro ou null).
 * É usado nas fotos da avaliação e nas fotos do veículo do estoque.
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
  const [poligonos, setPoligonos] = useState<Poligono[]>([]);
  const [cantos, setCantos] = useState<Ponto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  // Deslocamento em % do tamanho NÃO ampliado (o translate roda antes do scale).
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const arrasteRef = useRef<{ x: number; y: number; px: number; py: number; moveu: boolean } | null>(
    null,
  );

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
  }

  /**
   * Ponto do evento em fração da IMAGEM. Usa o retângulo do elemento já
   * transformado (o navegador devolve a caixa depois do zoom e do arrasto),
   * então vale para qualquer ampliação sem matemática extra.
   */
  function pontoDoEvento(e: React.PointerEvent): Ponto | null {
    const el = imagemRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  // Um gesto só resolve as duas coisas: arrastar move a foto, tocar marca o
  // canto. Sem modo para trocar — o que decide é o tanto que o dedo andou.
  function onPointerDown(e: React.PointerEvent) {
    if (saving) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    arrasteRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moveu: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const a = arrasteRef.current;
    if (!a) return;
    const dxPx = e.clientX - a.x;
    const dyPx = e.clientY - a.y;
    if (!a.moveu && Math.hypot(dxPx, dyPx) <= TOQUE_MAX_PX) return;
    a.moveu = true;
    if (zoom === 1) return; // sem ampliação não há para onde mover
    const el = imagemRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const limite = limitePan(zoom);
    setPan({
      x: Math.min(limite, Math.max(-limite, a.px + (dxPx / rect.width) * 100)),
      y: Math.min(limite, Math.max(-limite, a.py + (dyPx / rect.height) * 100)),
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    const a = arrasteRef.current;
    arrasteRef.current = null;
    if (!a || a.moveu || saving) return;
    const p = pontoDoEvento(e);
    if (!p) return;
    setError(null);
    const proximos = [...cantos, p];
    if (proximos.length >= CANTOS) {
      setPoligonos((atual) => [...atual, proximos]);
      setCantos([]);
    } else {
      setCantos(proximos);
    }
  }

  function desfazer() {
    if (cantos.length > 0) {
      setCantos((c) => c.slice(0, -1));
      return;
    }
    setPoligonos((p) => p.slice(0, -1));
  }

  async function handleSave() {
    if (poligonos.length === 0) {
      setError(
        cantos.length > 0
          ? `Faltam ${CANTOS - cantos.length} canto(s) para fechar a tarja.`
          : "Toque nos quatro cantos da placa antes de salvar.",
      );
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
      for (const pol of poligonos) {
        ctx.beginPath();
        pol.forEach((pt, i) => {
          const x = pt.x * cw;
          const y = pt.y * ch;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
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

  const emPontos = (pol: Ponto[]) => pol.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
  const temAlgo = poligonos.length > 0 || cantos.length > 0;

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
            <b>Toque nos quatro cantos da placa</b>, um de cada vez — a tarja fica com a forma exata
            dela, mesmo inclinada. Use o <b>+</b> para aproximar e <b>arraste</b> para mover a foto.
          </p>

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

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                cantos.length > 0
                  ? "bg-amber-100 text-amber-800"
                  : poligonos.length > 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {cantos.length > 0
                ? `Faltam ${CANTOS - cantos.length} canto(s)`
                : poligonos.length > 0
                  ? `${poligonos.length} tarja(s) pronta(s)`
                  : "Marque o 1º canto"}
            </span>

            {zoom > 1 ? (
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
            className="relative mx-auto block w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          >
            <div
              ref={imagemRef}
              className="relative"
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

              {/* As tarjas e as marcas ficam DENTRO do elemento ampliado:
                  acompanham zoom e arrasto sem recalcular nada. O SVG estica
                  junto (preserveAspectRatio="none"), então o ponto em % cai
                  exatamente sobre o mesmo pixel da foto. */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {poligonos.map((pol, i) => (
                  <polygon key={i} points={emPontos(pol)} fill="#000000" />
                ))}
                {cantos.length > 1 ? (
                  <polyline
                    points={emPontos(cantos)}
                    fill="rgba(0,0,0,0.35)"
                    stroke="#facc15"
                    strokeWidth="0.3"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>

              {/* Marcas dos cantos já tocados. O contra-scale mantém a bolinha
                  do mesmo tamanho na tela em qualquer ampliação. */}
              {cantos.map((c, i) => (
                <span
                  key={i}
                  className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 shadow"
                  style={{
                    left: `${c.x * 100}%`,
                    top: `${c.y * 100}%`,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  }}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>

          {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={desfazer} disabled={saving || !temAlgo}>
              Desfazer
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPoligonos([]);
                setCantos([]);
              }}
              disabled={saving || !temAlgo}
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
