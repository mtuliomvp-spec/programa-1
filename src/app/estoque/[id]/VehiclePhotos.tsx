"use client";

import { useRef, useState, useTransition, useActionState } from "react";
import { Button } from "@/components/ui";
import {
  uploadVehiclePhotosAction,
  deleteVehicleAttachmentAction,
  toggleVehiclePublishedAction,
  type AttachmentState,
} from "../actions";

type Photo = { id: string; filename: string; createdAt: Date | string };

/** Galeria de fotos do veículo: envio múltiplo + miniatura + excluir + postar. */
export default function VehiclePhotos({
  vehicleId,
  photos,
  published,
  inStock,
  canManage = true,
  canPublish = true,
}: {
  vehicleId: string;
  photos: Photo[];
  published: boolean;
  inStock: boolean;
  canManage?: boolean;
  canPublish?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [publishing, startPublish] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [state, formAction, pending] = useActionState(
    async (prev: AttachmentState, formData: FormData) => {
      const result = await uploadVehiclePhotosAction(prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        setSelectedCount(0);
      }
      return result;
    },
    {} as AttachmentState,
  );

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
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <form ref={formRef} action={formAction} className="space-y-2">
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <input
            type="file"
            name="photos"
            accept="image/*"
            multiple
            onChange={(e) => setSelectedCount(e.target.files?.length ?? 0)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || selectedCount === 0}>
              {pending ? "Enviando..." : selectedCount > 1 ? `Enviar ${selectedCount} fotos` : "Enviar foto"}
            </Button>
            <p className="text-xs text-slate-400">Pode escolher várias de uma vez (até 15 MB cada).</p>
          </div>
          {state.error ? <p className="text-sm font-medium text-rose-600">{state.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
