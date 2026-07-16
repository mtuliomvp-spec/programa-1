"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { uploadClientPhotoAction } from "../actions";

type Coords = { latitude: number; longitude: number; accuracy: number };

const MAX_SIDE = 1600; // maior lado da foto após redução
const JPEG_QUALITY = 0.85;

/** Pede a localização do aparelho; resolve null se negada/indisponível. */
function getLocation(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/** Decodifica o arquivo respeitando a orientação EXIF (com fallback). */
async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
    } catch {
      /* cai no fallback com <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reduz + carimba data/hora e coordenadas na imagem; devolve um JPEG. */
async function stampPhoto(file: File, coords: Coords | null): Promise<Blob> {
  const src = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  src.draw(ctx, w, h);

  const now = new Date();
  const dataHora = now.toLocaleString("pt-BR");
  const linhas = [
    `MVP Veículos · ${dataHora}`,
    coords
      ? `Local: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (±${Math.round(coords.accuracy)}m)`
      : "Localização não disponível",
  ];

  const fontSize = Math.max(16, Math.round(w * 0.028));
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "bottom";
  const pad = Math.round(fontSize * 0.5);
  const lineH = Math.round(fontSize * 1.35);
  const boxH = lineH * linhas.length + pad;
  // Faixa escura no rodapé para o texto ficar legível sobre qualquer foto.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - boxH, w, boxH);
  ctx.fillStyle = "#ffffff";
  linhas.forEach((linha, i) => {
    ctx.fillText(linha, pad, h - boxH + lineH * (i + 1));
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a imagem."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export default function ClientPhotoCapture({ vehicleId }: { vehicleId: string }) {
  const rearRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite tirar outra foto igual em seguida
    if (!file) return;
    setError(null);
    setDone(false);
    setProcessing(true);
    try {
      const loc = await getLocation();
      const stamped = await stampPhoto(file, loc);
      setCoords(loc);
      setBlob(stamped);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(stamped);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível preparar a foto.");
    } finally {
      setProcessing(false);
    }
  }

  function submit() {
    if (!blob) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("vehicleId", vehicleId);
      fd.set("file", new File([blob], `foto-cliente-${Date.now()}.jpg`, { type: "image/jpeg" }));
      if (coords) {
        fd.set("latitude", String(coords.latitude));
        fd.set("longitude", String(coords.longitude));
        fd.set("geoAccuracy", String(coords.accuracy));
      }
      const res = await uploadClientPhotoAction({}, fd);
      if (res.error) {
        setError(res.error);
      } else {
        setDone(true);
        setBlob(null);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return null;
        });
        setCoords(null);
      }
    });
  }

  return (
    <div className="p-5">
      <p className="mb-3 text-sm text-slate-600">
        Registre uma foto do comprador com data/hora e localização carimbadas — prova contra alegação de
        fraude. A localização é opcional: se você negar o acesso, a foto é anexada mesmo assim.
      </p>

      <input ref={rearRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      <input ref={frontRef} type="file" accept="image/*" capture="user" onChange={onFile} className="hidden" />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={processing || pending} onClick={() => rearRef.current?.click()}>
          📷 Fotografar cliente
        </Button>
        <Button type="button" variant="secondary" disabled={processing || pending} onClick={() => frontRef.current?.click()}>
          🤳 Selfie com o cliente
        </Button>
      </div>

      {processing ? <p className="mt-3 text-sm text-slate-500">Preparando a foto e a localização…</p> : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      {done ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Foto do cliente anexada ao prontuário.
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Prévia da foto do cliente" className="max-h-80 w-auto rounded-lg border border-slate-200" />
          <p className="text-xs text-slate-500">
            {coords
              ? `Localização: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (±${Math.round(coords.accuracy)}m)`
              : "Sem localização (acesso negado ou indisponível)."}
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? "Anexando..." : "Anexar foto"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setPreview((old) => {
                  if (old) URL.revokeObjectURL(old);
                  return null;
                });
                setBlob(null);
                setCoords(null);
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
