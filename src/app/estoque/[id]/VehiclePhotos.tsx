"use client";

import { useRef, useState, useTransition, useActionState } from "react";
import { Button } from "@/components/ui";
import { uploadVehiclePhotosAction, deleteVehicleAttachmentAction, type AttachmentState } from "../actions";

type Photo = { id: string; filename: string; createdAt: Date | string };

/** Galeria de fotos do veículo: envio múltiplo + miniatura + excluir. */
export default function VehiclePhotos({ vehicleId, photos }: { vehicleId: string; photos: Photo[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
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

  return (
    <div className="space-y-4 p-5">
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
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
