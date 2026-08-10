"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehicleAttachmentAction,
  deleteVehicleAttachmentAction,
  readCrlvAttachmentAction,
  type AttachmentState,
} from "../actions";

type Crlv = {
  id: string;
  description: string;
  filename: string;
  size: number;
  createdAt: Date | string;
};

/** Extrai o ano em exercício guardado no description ("CRLV 2025" → "2025"). */
function crlvYear(description: string): string | null {
  return description.match(/(\d{4})/)?.[1] ?? null;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Campo dedicado para o CRLV do veículo. Guarda o ano em exercício no próprio
 * description ("CRLV 2025"), então o card do estoque consegue mostrar o ano.
 */
export default function VehicleCrlv({
  vehicleId,
  crlvs,
  canManage = true,
}: {
  vehicleId: string;
  crlvs: Crlv[];
  canManage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    uploadVehicleAttachmentAction,
    {} as AttachmentState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [removing, startRemove] = useTransition();
  // Releitura de um CRLV já anexado: id do que está sendo lido + resultado.
  const [reading, startRead] = useTransition();
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<AttachmentState | null>(null);
  const [preparing, setPreparing] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  async function handleSend() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    const ano = String(fd.get("ano") || "").trim() || String(currentYear);
    fd.set("vehicleId", vehicleId);
    fd.set("kind", "CRLV");
    fd.set("description", `CRLV ${ano}`);
    setPreparing(true);
    try {
      // Lado maior de 2400 px (em vez dos 1600 padrão): o chassi é letra miúda
      // e a IA precisa lê-lo caractere a caractere. PDF passa intacto.
      fd.set("file", await resizeImageToJpeg(file, 2400, 0.92));
      formAction(fd);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="p-5">
      {readResult?.error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {readResult.error}
        </p>
      ) : null}
      {readResult?.ok ? (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <p>
            {readResult.filled?.length
              ? "CRLV lido."
              : "CRLV lido — a ficha já estava completa, nada mudou."}
          </p>
          {readResult.filled?.length ? (
            <p className="mt-1">
              Preenchido: <strong>{readResult.filled.join(" · ")}</strong>. Confira na ficha acima.
            </p>
          ) : null}
        </div>
      ) : null}
      {readResult?.warnings?.length ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {readResult.warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      ) : null}
      {crlvs.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">
          Nenhum CRLV anexado ainda. Anexe abaixo, informando o ano em exercício.
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {crlvs.map((c) => {
            const ano = crlvYear(c.description);
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-emerald-700">
                    ✓ {ano ? `CRLV ${ano}` : "CRLV"} anexado
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {c.filename} · {humanSize(c.size)} · {formatDate(c.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <a
                    href={`/anexos/${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Abrir
                  </a>
                  <a
                    href={`/anexos/${c.id}?download=1`}
                    className="font-medium text-slate-600 hover:underline"
                  >
                    Baixar
                  </a>
                  {canManage ? (
                    <button
                      type="button"
                      disabled={reading}
                      onClick={() => {
                        setReadResult(null);
                        setReadingId(c.id);
                        startRead(async () => setReadResult(await readCrlvAttachmentAction(c.id)));
                      }}
                      className="font-medium text-blue-700 hover:underline disabled:opacity-50"
                      title="Lê este CRLV e preenche o que falta na ficha do veículo"
                    >
                      {reading && readingId === c.id ? "Lendo…" : "Ler dados"}
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => {
                        if (confirm(`Excluir o ${ano ? `CRLV ${ano}` : "CRLV"}?`)) {
                          startRemove(() => deleteVehicleAttachmentAction(c.id, vehicleId));
                        }
                      }}
                      className="font-medium text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
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
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <p>CRLV anexado.</p>
            {state.filled?.length ? (
              <p className="mt-1">
                Preenchido a partir do documento: <strong>{state.filled.join(" · ")}</strong>.
                Confira na ficha acima.
              </p>
            ) : null}
          </div>
        ) : null}
        {state.warnings?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {state.warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Ano em exercício">
            <Input
              type="number"
              name="ano"
              min={2000}
              max={currentYear + 1}
              defaultValue={currentYear}
              required
            />
          </Field>
          <Field label="Arquivo do CRLV (PDF, imagem…)">
            <input
              type="file"
              name="file"
              required
              accept=".pdf,image/*"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={handleSend} disabled={pending || preparing}>
            {preparing ? "Preparando…" : pending ? "Lendo o CRLV…" : "Anexar CRLV"}
          </Button>
        </div>
      </form>
    </div>
  );
}
