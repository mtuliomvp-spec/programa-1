"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  uploadVehicleAttachmentAction,
  deleteVehicleAttachmentAction,
  type AttachmentState,
} from "../actions";

type Attachment = {
  id: string;
  description: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VehicleAttachments({
  vehicleId,
  attachments,
}: {
  vehicleId: string;
  attachments: Attachment[];
}) {
  const [state, formAction, pending] = useActionState(
    uploadVehicleAttachmentAction,
    {} as AttachmentState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [removing, startRemove] = useTransition();

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="p-5">
      {attachments.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">Nenhum documento anexado ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{a.description}</p>
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
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => {
                    if (confirm(`Excluir o documento "${a.description}"?`)) {
                      startRemove(() => deleteVehicleAttachmentAction(a.id, vehicleId));
                    }
                  }}
                  className="font-medium text-rose-600 hover:underline disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="space-y-3 border-t border-slate-100 pt-4">
        <input type="hidden" name="vehicleId" value={vehicleId} />
        {state.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Documento anexado.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Documento">
            <Input name="description" defaultValue="Comunicação de venda" placeholder="Ex: Comunicação de venda" />
          </Field>
          <Field label="Arquivo (PDF, imagem…)">
            <input
              type="file"
              name="file"
              required
              accept=".pdf,image/*,.doc,.docx"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Anexando..." : "Anexar documento"}
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          O arquivo fica guardado com segurança e pode ser aberto ou baixado a qualquer momento. Máximo 15 MB.
        </p>
      </form>
    </div>
  );
}
