"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehicleAttachmentAction,
  deleteVehicleAttachmentAction,
  type AttachmentState,
} from "../actions";

type Atpv = {
  id: string;
  description: string;
  filename: string;
  size: number;
  createdAt: Date | string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Campo dedicado para a ATPV-e (Autorização para Transferência de Propriedade
 * do Veículo, eletrônica). Mesmo molde do CRLV/Comunicação de venda: o anexo é
 * um documento comum identificado pela descrição "ATPV-e" — o card de
 * Documentos do veículo não o lista de novo.
 */
export default function VehicleAtpv({
  vehicleId,
  atpvs,
  canManage = true,
}: {
  vehicleId: string;
  atpvs: Atpv[];
  canManage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    uploadVehicleAttachmentAction,
    {} as AttachmentState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [removing, startRemove] = useTransition();
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  async function handleSend() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    fd.set("vehicleId", vehicleId);
    fd.set("kind", "DOCUMENTO");
    fd.set("description", "ATPV-e");
    setPreparing(true);
    try {
      fd.set("file", await resizeImageToJpeg(file));
      formAction(fd);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="p-5">
      {atpvs.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">Nenhuma ATPV-e anexada ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {atpvs.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-emerald-700">✓ ATPV-e anexada</p>
                <p className="truncate text-xs text-slate-400">
                  {a.filename} · {humanSize(a.size)} · {formatDate(a.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <a
                  href={`/anexos/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Abrir
                </a>
                <a
                  href={`/anexos/${a.id}?download=1`}
                  className="font-medium text-slate-600 hover:underline"
                >
                  Baixar
                </a>
                {canManage ? (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => {
                      if (confirm("Excluir a ATPV-e?")) {
                        startRemove(() => deleteVehicleAttachmentAction(a.id, vehicleId));
                      }
                    }}
                    className="font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        className={`space-y-3 border-t border-slate-100 pt-4 ${canManage ? "" : "hidden"}`}
      >
        {state.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ATPV-e anexada.
          </p>
        ) : null}
        <Field label="Arquivo da ATPV-e (PDF, imagem…)">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="button" onClick={handleSend} disabled={pending || preparing}>
            {preparing ? "Preparando…" : pending ? "Enviando…" : "Anexar ATPV-e"}
          </Button>
        </div>
      </form>
    </div>
  );
}
