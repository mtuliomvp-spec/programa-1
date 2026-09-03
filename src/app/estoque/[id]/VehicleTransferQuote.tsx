"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehicleAttachmentAction,
  deleteVehicleAttachmentAction,
  readTransferQuoteAttachmentAction,
  type AttachmentState,
} from "../actions";

type Quote = {
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

/** Mensagens da leitura (o que foi lançado e os avisos), iguais às do CRLV. */
function Resultado({ state }: { state: AttachmentState }) {
  if (state.error) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
    );
  }
  if (!state.ok) return null;
  return (
    <div className="space-y-1">
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {state.filled?.length ? (
          <>
            Orçamento lido. <strong>{state.filled.join(" · ")}</strong>.
          </>
        ) : (
          "Orçamento anexado."
        )}
      </p>
      {state.warnings?.map((w, i) => (
        <p key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {w}
        </p>
      ))}
    </div>
  );
}

/**
 * Orçamento/recibo da transferência de propriedade emitido pelo despachante.
 * Ao anexar, a IA lê o recibo e lança o título da transferência no Contas a
 * pagar (custo do veículo, fornecedor = despachante); o campo "Cliente" do
 * recibo diz para quem o carro será transferido. Documento comum identificado
 * pela descrição "Orçamento de transferência" — o card de Documentos do
 * veículo não o lista de novo, e a lista do estoque mostra um selo.
 */
export default function VehicleTransferQuote({
  vehicleId,
  quotes,
  canManage = true,
  transferToName = null,
}: {
  vehicleId: string;
  quotes: Quote[];
  canManage?: boolean;
  /** Para quem o veículo será transferido (campo "Cliente" do recibo). */
  transferToName?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    uploadVehicleAttachmentAction,
    {} as AttachmentState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [removing, startRemove] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const [reading, startRead] = useTransition();
  const [readingId, setReadingId] = useState<string | null>(null);
  const [readState, setReadState] = useState<AttachmentState>({});

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
    fd.set("description", "Orçamento de transferência");
    setPreparing(true);
    setReadState({});
    try {
      fd.set("file", await resizeImageToJpeg(file));
      formAction(fd);
    } finally {
      setPreparing(false);
    }
  }

  function handleRead(id: string) {
    setReadingId(id);
    setReadState({});
    startRead(async () => {
      const r = await readTransferQuoteAttachmentAction(id);
      setReadState(r);
      setReadingId(null);
    });
  }

  return (
    <div className="p-5">
      {transferToName ? (
        <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          🔄 Transferência para <strong>{transferToName}</strong> (cliente do orçamento do despachante).
        </p>
      ) : null}

      {quotes.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">Nenhum orçamento anexado ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-emerald-700">
                  ✓ Orçamento de transferência anexado
                </p>
                <p className="truncate text-xs text-slate-400">
                  {q.filename} · {humanSize(q.size)} · {formatDate(q.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                {canManage ? (
                  <button
                    type="button"
                    disabled={reading}
                    onClick={() => handleRead(q.id)}
                    className="font-medium text-indigo-700 hover:underline disabled:opacity-50"
                    title="A IA lê o recibo e lança o título da transferência no Contas a pagar"
                  >
                    {reading && readingId === q.id ? "Lendo…" : "🤖 Ler e lançar"}
                  </button>
                ) : null}
                <a
                  href={`/anexos/${q.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Abrir
                </a>
                <a
                  href={`/anexos/${q.id}?download=1`}
                  className="font-medium text-slate-600 hover:underline"
                >
                  Baixar
                </a>
                {canManage ? (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => {
                      if (confirm("Excluir o orçamento de transferência?")) {
                        startRemove(() => deleteVehicleAttachmentAction(q.id, vehicleId));
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

      {readState.ok || readState.error ? <div className="mb-4"><Resultado state={readState} /></div> : null}

      <form
        ref={formRef}
        className={`space-y-3 border-t border-slate-100 pt-4 ${canManage ? "" : "hidden"}`}
      >
        <Resultado state={state} />
        <Field label="Arquivo do orçamento (PDF, imagem…)">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ao anexar, a IA lê o recibo do despachante e lança o título da transferência no Contas a
            pagar (fornecedor = despachante). O campo “Cliente” do recibo diz para quem o veículo será
            transferido.
          </p>
        </Field>
        {pending ? (
          <p className="text-xs text-slate-500">Anexando e lendo o orçamento — pode levar até um minuto.</p>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" onClick={handleSend} disabled={pending || preparing}>
            {preparing ? "Preparando…" : pending ? "Enviando e lendo…" : "Anexar orçamento"}
          </Button>
        </div>
      </form>
    </div>
  );
}
