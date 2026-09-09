"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import { removeComboReceiptAction } from "../actions";

/**
 * O comprovante já anexado ao combo: abrir, baixar e trocar. Tirar o
 * comprovante também tira o combo da fila de espera do caixa — o pré-lançamento
 * existe por causa dele.
 */
export default function ComboReceipt({
  comboId,
  anexo,
  podeRemover,
}: {
  comboId: string;
  anexo: { id: string; filename: string; size: number; createdAt: string };
  podeRemover: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remover() {
    if (!confirm("Tirar o comprovante do combo? Ele também sai da fila de espera do caixa.")) return;
    start(async () => {
      await removeComboReceiptAction(comboId);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium text-slate-800">🧾 {anexo.filename}</span>
        <span className="block text-xs text-slate-400">
          {Math.max(1, Math.round(anexo.size / 1024))} KB · anexado em {formatDate(anexo.createdAt)}
        </span>
      </span>
      <a
        href={`/financeiro/combos/anexos/${anexo.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-blue-700 hover:underline"
      >
        Abrir
      </a>
      <a
        href={`/financeiro/combos/anexos/${anexo.id}?download=1`}
        className="font-medium text-slate-600 hover:underline"
      >
        Baixar
      </a>
      {podeRemover ? (
        <button
          type="button"
          onClick={remover}
          disabled={pending}
          className="font-medium text-rose-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Removendo…" : "Remover"}
        </button>
      ) : null}
    </div>
  );
}
