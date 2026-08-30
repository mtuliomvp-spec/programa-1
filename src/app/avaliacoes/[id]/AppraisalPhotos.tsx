"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import PlateCoverEditor from "@/components/PlateCoverEditor";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadAppraisalPhotosAction,
  deleteAppraisalPhotoAction,
  replaceAppraisalPhotoAction,
} from "../actions";

type Photo = { id: string; filename: string };

const MAX_PHOTOS = 12;
const BATCH = 3;

/** Galeria de fotos da avaliação: envio múltiplo (em lotes) + excluir. */
export default function AppraisalPhotos({
  appraisalId,
  photos,
  canManage = true,
}: {
  appraisalId: string;
  photos: Photo[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null);

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
        fd.set("appraisalId", appraisalId);
        for (const f of lote) fd.append("photos", f);
        const res = await uploadAppraisalPhotosAction({}, fd);
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

  return (
    <div className="space-y-4 p-5">
      {photos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma foto ainda — adicione abaixo.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <a href={`/avaliacoes/foto/${p.id}`} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/avaliacoes/foto/${p.id}`}
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
                      startDelete(() => deleteAppraisalPhotoAction(p.id, appraisalId));
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
          imageUrl={`/avaliacoes/foto/${coverPhotoId}`}
          onClose={() => setCoverPhotoId(null)}
          onSave={async (file) => {
            const fd = new FormData();
            fd.set("appraisalId", appraisalId);
            fd.set("replaceId", coverPhotoId);
            fd.set("photo", file);
            const res = await replaceAppraisalPhotoAction({}, fd);
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
