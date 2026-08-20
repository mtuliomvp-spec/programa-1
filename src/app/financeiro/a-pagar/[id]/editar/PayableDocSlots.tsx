"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { uploadPayableAttachmentAction, deletePayableAttachmentAction } from "../../actions";

type Doc = {
  id: string;
  kind: string;
  filename: string;
  size: number;
  createdAt: Date | string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Um slot dedicado (Boleto ou Comprovante): mostra o arquivo atual ou o envio. */
function Slot({
  payableId,
  kind,
  title,
  hint,
  current,
}: {
  payableId: string;
  kind: "BOLETO" | "COMPROVANTE";
  title: string;
  hint: string;
  current: Doc | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  async function handleSend() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const prepared = await resizeImageToJpeg(file);
      const fd = new FormData();
      fd.set("payableId", payableId);
      fd.set("kind", kind);
      fd.set("file", prepared);
      const res = await uploadPayableAttachmentAction({}, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {current ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-700">📎 {current.filename}</p>
            <p className="text-xs text-slate-400">
              {humanSize(current.size)} · {formatDate(current.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <a
              href={`/financeiro/a-pagar/anexos/${current.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-700 hover:underline"
            >
              Abrir
            </a>
            <a
              href={`/financeiro/a-pagar/anexos/${current.id}?download=1`}
              className="font-medium text-slate-600 hover:underline"
            >
              Baixar
            </a>
            <button
              type="button"
              disabled={removing}
              onClick={() => {
                if (confirm(`Excluir o ${title.toLowerCase()}?`)) {
                  startRemove(async () => {
                    await deletePayableAttachmentAction(current.id, payableId);
                    router.refresh();
                  });
                }
              }}
              className="font-medium text-rose-600 hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <Button type="button" variant="secondary" onClick={handleSend} disabled={busy}>
          {busy ? "Enviando…" : current ? "Substituir" : "Anexar"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

/** Outros anexos do título (NF-e importada, nota fiscal da ordem…). */
function OtherAttachments({ payableId, docs }: { payableId: string; docs: DocWithDescription[] }) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();
  if (docs.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
      <p className="text-sm font-semibold text-slate-700">Outros anexos (NF-e, nota fiscal…)</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-700">📎 {d.description}</p>
              <p className="truncate text-xs text-slate-400">
                {d.filename} · {humanSize(d.size)} · {formatDate(d.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm">
              <a
                href={`/financeiro/a-pagar/anexos/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 hover:underline"
              >
                Abrir
              </a>
              <a
                href={`/financeiro/a-pagar/anexos/${d.id}?download=1`}
                className="font-medium text-slate-600 hover:underline"
              >
                Baixar
              </a>
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  if (confirm(`Excluir o anexo "${d.description}"?`)) {
                    startRemove(async () => {
                      await deletePayableAttachmentAction(d.id, payableId);
                      router.refresh();
                    });
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
    </div>
  );
}

type DocWithDescription = Doc & { description: string };

/** Dois slots (Boleto e Comprovante), um arquivo cada + demais anexos. */
export default function PayableDocSlots({
  payableId,
  boleto,
  comprovante,
  others = [],
}: {
  payableId: string;
  boleto: Doc | null;
  comprovante: Doc | null;
  /** Anexos de outros tipos (ex.: NF-e importada), só listados. */
  others?: DocWithDescription[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
      <Slot
        payableId={payableId}
        kind="BOLETO"
        title="Boleto de pagamento"
        hint="Anexe o boleto (PDF ou foto)."
        current={boleto}
      />
      <Slot
        payableId={payableId}
        kind="COMPROVANTE"
        title="Comprovante de pagamento"
        hint="Anexe o comprovante do pagamento (PDF ou foto)."
        current={comprovante}
      />
      <OtherAttachments payableId={payableId} docs={others} />
    </div>
  );
}
