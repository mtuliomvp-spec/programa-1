"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui";
import { deleteRecurringAttachmentAction } from "../actions";

export type DocumentoRecorrencia = {
  id: string;
  description: string;
  filename: string;
  size: number;
  createdAt: string;
};

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Documentos da recorrência (contrato de aluguel, de serviço…): os já
 * anexados, com abrir/baixar/excluir, e o campo para anexar mais — os
 * arquivos escolhidos são gravados junto com o formulário, ao salvar.
 */
export default function RecurringDocs({ documentos }: { documentos: DocumentoRecorrencia[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function excluir(id: string) {
    if (!confirm("Excluir este documento da recorrência?")) return;
    setErro(null);
    start(async () => {
      const r = await deleteRecurringAttachmentAction(id);
      if (!r.ok) setErro(r.error || "Não foi possível excluir.");
      router.refresh();
    });
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">📎 Documentos (contrato etc.)</legend>
      {documentos.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{d.description}</span>
                <span className="block truncate text-xs text-slate-400">
                  {d.filename} · {tamanho(d.size)} · {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs">
                <a
                  href={`/financeiro/recorrentes/anexos/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Abrir
                </a>
                <a href={`/financeiro/recorrentes/anexos/${d.id}?download=1`} className="font-medium text-slate-600 hover:underline">
                  Baixar
                </a>
                <button
                  type="button"
                  onClick={() => excluir(d.id)}
                  disabled={pending}
                  className="font-medium text-rose-600 hover:underline disabled:opacity-50"
                >
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Nenhum documento anexado ainda.</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Anexar (PDF, foto…)">
          <input
            type="file"
            name="documentos"
            multiple
            accept="application/pdf,image/*,.doc,.docx"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </Field>
        <Field label="Descrição (opcional)">
          <Input name="documentoDescricao" placeholder="Ex.: Contrato de locação" />
        </Field>
      </div>
      <p className="text-xs text-slate-500">Os arquivos escolhidos são guardados ao salvar a recorrência (até 15 MB cada).</p>
      {erro ? <p className="text-xs text-rose-700">{erro}</p> : null}
    </fieldset>
  );
}
