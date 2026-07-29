"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadPayableAttachmentAction,
  deletePayableAttachmentAction,
  type AttachmentState,
} from "../../actions";

type Attachment = {
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

export default function PayableAttachments({
  payableId,
  attachments,
  canManage = true,
}: {
  payableId: string;
  attachments: Attachment[];
  canManage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(uploadPayableAttachmentAction, {} as AttachmentState);
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
    setPreparing(true);
    try {
      fd.set("file", await resizeImageToJpeg(file));
      formAction(fd);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div>
      {attachments.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">Nenhum anexo neste título.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-100">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{a.description}</p>
                <p className="truncate text-xs text-slate-400">
                  {a.filename} · {humanSize(a.size)} · {formatDate(a.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <a
                  href={`/financeiro/a-pagar/anexos/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Abrir
                </a>
                <a
                  href={`/financeiro/a-pagar/anexos/${a.id}?download=1`}
                  className="font-medium text-slate-600 hover:underline"
                >
                  Baixar
                </a>
                {canManage ? (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => {
                      if (confirm(`Excluir o anexo "${a.description}"?`)) {
                        startRemove(() => deletePayableAttachmentAction(a.id, payableId));
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

      {canManage ? (
        <form ref={formRef} className="space-y-3 border-t border-slate-100 pt-3">
          <input type="hidden" name="payableId" value={payableId} />
          {state.error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
          ) : null}
          {state.ok ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Anexo enviado.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Descrição">
              <Input name="description" defaultValue="Nota fiscal" placeholder="Ex: Nota fiscal" />
            </Field>
            <Field label="Arquivo (PDF, imagem…)">
              <input
                type="file"
                name="file"
                required
                accept="image/*,.pdf,.doc,.docx"
                capture="environment"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSend} disabled={pending || preparing}>
              {preparing ? "Preparando…" : pending ? "Anexando..." : "Anexar"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">O arquivo fica guardado e pode ser aberto/baixado depois. Máximo 15 MB.</p>
        </form>
      ) : null}
    </div>
  );
}
