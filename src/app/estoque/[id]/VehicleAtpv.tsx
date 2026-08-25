"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehicleAttachmentAction,
  deleteVehicleAttachmentAction,
  readAtpvAttachmentAction,
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
  const [lendo, startLeitura] = useTransition();
  const [leitura, setLeitura] = useState<AttachmentState | null>(null);

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
                {/* Depois da leitura a descrição carrega o número da ATPV-e. */}
                <p className="truncate text-sm font-medium text-emerald-700">
                  ✓ {/atpv-e n/i.test(a.description) ? a.description : "ATPV-e anexada"}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {a.filename} · {humanSize(a.size)} · {formatDate(a.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                {canManage ? (
                  <button
                    type="button"
                    disabled={lendo}
                    onClick={() => {
                      setLeitura(null);
                      startLeitura(async () => setLeitura(await readAtpvAttachmentAction(a.id)));
                    }}
                    className="font-medium text-indigo-700 hover:underline disabled:opacity-50"
                    title="A IA lê o documento e completa a ficha (número e código do CRV, chassi, RENAVAM)"
                  >
                    {lendo ? "Lendo…" : "🤖 Ler este documento"}
                  </button>
                ) : null}
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

      {lendo ? (
        <p className="mb-4 text-xs text-slate-500">
          A IA está lendo a ATPV-e — costuma levar alguns segundos. Não feche a página.
        </p>
      ) : null}

      {leitura?.error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {leitura.error}
        </p>
      ) : null}

      {leitura?.ok ? (
        <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          {leitura.filled && leitura.filled.length > 0 ? (
            <div>
              <p className="font-medium text-emerald-800">
                ✓ {leitura.filled.length} dado(s) preenchido(s) na ficha:
              </p>
              <ul className="mt-1 space-y-0.5 text-emerald-700">
                {leitura.filled.map((f, i) => (
                  <li key={i}>· {f}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {leitura.warnings && leitura.warnings.length > 0 ? (
            <ul className="space-y-0.5 text-amber-800">
              {leitura.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-emerald-700">Recarregue a página para ver a ficha atualizada.</p>
        </div>
      ) : null}

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
