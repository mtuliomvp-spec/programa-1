"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import PlateCoverEditor from "@/components/PlateCoverEditor";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehiclePhotosAction,
  deleteVehicleAttachmentAction,
  replaceVehiclePhotoAction,
  toggleVehiclePublishedAction,
} from "../actions";

type Photo = { id: string; filename: string; createdAt: Date | string };

/**
 * Quantas pessoas abriram o anúncio deste carro na vitrine. Fica junto do
 * botão de postar porque é a resposta da pergunta que vem logo depois de
 * publicar: "está aparecendo para alguém?".
 */
function VisitasDoAnuncio({
  visitas,
  published,
}: {
  visitas: { total: number; ultimos7: number; pessoas: number };
  published: boolean;
}) {
  if (visitas.total === 0) {
    return published ? (
      <p className="text-xs text-slate-500">
        👁️ Nenhuma visita ao anúncio ainda — ele acabou de entrar no ar.
      </p>
    ) : null;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-slate-800">
        👁️ {visitas.total} visita{visitas.total === 1 ? "" : "s"} no anúncio
      </span>
      <span className="text-xs text-slate-500">
        {visitas.ultimos7} nos últimos 7 dias · {visitas.pessoas} pessoa
        {visitas.pessoas === 1 ? "" : "s"} diferente{visitas.pessoas === 1 ? "" : "s"}
      </span>
      {!published ? (
        <span className="text-xs text-amber-700">anúncio fora do ar agora</span>
      ) : null}
    </div>
  );
}

/** Máximo de fotos por envio e tamanho do lote (mantém cada requisição pequena,
 *  abaixo do limite de corpo do Server Action, mesmo com fotos grandes). */
const MAX_PHOTOS = 10;
const BATCH = 3;

/** Galeria de fotos do veículo: envio múltiplo + miniatura + excluir + postar. */
export default function VehiclePhotos({
  vehicleId,
  photos,
  published,
  inStock,
  visitas,
  canManage = true,
  canPublish = true,
}: {
  vehicleId: string;
  photos: Photo[];
  published: boolean;
  inStock: boolean;
  /** Visitas ao anúncio na vitrine (não conta a equipe logada). */
  visitas: { total: number; ultimos7: number; pessoas: number };
  canManage?: boolean;
  canPublish?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);

  // Redimensiona no navegador (JPEG, lado máx. 1600px) e envia em LOTES pequenos.
  // Assim a quantidade de fotos não depende do limite de 25 MB por requisição —
  // dá para anexar até 10 fotos mesmo que algumas sejam grandes (ex.: HEIC).
  async function handleSend() {
    let files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setUploadError(null);

    let aviso = "";
    if (files.length > MAX_PHOTOS) {
      files = files.slice(0, MAX_PHOTOS);
      aviso = ` (enviando as ${MAX_PHOTOS} primeiras)`;
    }

    setPreparing(true);
    let resized: File[];
    try {
      resized = await Promise.all(files.map((f) => resizeImageToJpeg(f)));
    } finally {
      setPreparing(false);
    }

    setUploading(true);
    try {
      for (let i = 0; i < resized.length; i += BATCH) {
        const lote = resized.slice(i, i + BATCH);
        setUploadMsg(`Enviando ${Math.min(i + lote.length, resized.length)} de ${resized.length}${aviso}…`);
        const fd = new FormData();
        fd.set("vehicleId", vehicleId);
        for (const f of lote) fd.append("photos", f);
        const res = await uploadVehiclePhotosAction({}, fd);
        if (res.error) {
          setUploadError(res.error);
          setUploadMsg(null);
          router.refresh();
          return;
        }
      }
      formRef.current?.reset();
      setSelectedCount(0);
      setUploadMsg(null);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function togglePublish(next: boolean) {
    setPublishError(null);
    startPublish(async () => {
      const r = await toggleVehiclePublishedAction(vehicleId, next);
      if (!r.ok) setPublishError(r.error || "Não foi possível atualizar a vitrine.");
    });
  }

  return (
    <div className="space-y-4 p-5">
      {inStock && canPublish ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          {published ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                📢 No ar na vitrine
              </span>
              <a
                href={`/vitrine/${vehicleId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                Ver anúncio →
              </a>
              <button
                type="button"
                onClick={() => togglePublish(false)}
                disabled={publishing}
                className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
              >
                {publishing ? "Removendo..." : "Remover da vitrine"}
              </button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => togglePublish(true)} disabled={publishing}>
                {publishing ? "Postando..." : "📢 Postar na vitrine"}
              </Button>
              <p className="text-xs text-slate-500">
                Publica este veículo (fotos + dados do anúncio) na página pública da loja.
              </p>
            </>
          )}
          {publishError ? (
            <p className="w-full text-sm font-medium text-rose-600">{publishError}</p>
          ) : null}
        </div>
      ) : null}

      <VisitasDoAnuncio visitas={visitas} published={published} />

      {photos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma foto ainda — adicione abaixo.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <a href={`/anexos/${p.id}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/anexos/${p.id}`}
                  alt={p.filename}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                />
              </a>
              {canManage ? (
                <>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      if (!confirm("Excluir esta foto?")) return;
                      startDelete(() => deleteVehicleAttachmentAction(p.id, vehicleId));
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white hover:bg-rose-600"
                    title="Excluir foto"
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverPhotoId(p.id)}
                    className="absolute inset-x-1 bottom-1 rounded-md bg-black/60 px-1.5 py-1 text-[11px] font-medium text-white hover:bg-black/80"
                    title="Cobrir a placa"
                  >
                    🔒 Cobrir placa
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {coverPhotoId ? (
        <PlateCoverEditor
          imageUrl={`/anexos/${coverPhotoId}`}
          onClose={() => setCoverPhotoId(null)}
          onSave={async (file) => {
            const fd = new FormData();
            fd.set("vehicleId", vehicleId);
            fd.set("replaceId", coverPhotoId);
            fd.set("photo", file);
            const res = await replaceVehiclePhotoAction({}, fd);
            return res.error ?? null;
          }}
          onSaved={() => {
            setCoverPhotoId(null);
            router.refresh();
          }}
        />
      ) : null}

      {canManage ? (
        <form ref={formRef} className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            name="photos"
            accept="image/*"
            multiple
            onChange={(e) => setSelectedCount(e.target.files?.length ?? 0)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSend} disabled={uploading || preparing || selectedCount === 0}>
              {preparing
                ? "Preparando as fotos…"
                : uploading
                  ? uploadMsg || "Enviando…"
                  : selectedCount > 1
                    ? `Enviar ${selectedCount > MAX_PHOTOS ? MAX_PHOTOS : selectedCount} fotos`
                    : "Enviar foto"}
            </Button>
            <p className="text-xs text-slate-400">Até {MAX_PHOTOS} fotos por vez — são otimizadas automaticamente.</p>
          </div>
          {uploadError ? <p className="text-sm font-medium text-rose-600">{uploadError}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
