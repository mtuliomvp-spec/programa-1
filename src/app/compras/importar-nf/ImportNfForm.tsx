"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { importNfAction, type ImportNfResult } from "./actions";

/**
 * Envia as notas UMA POR VEZ, mostrando o progresso: a leitura por IA leva
 * alguns segundos por nota, e assim uma nota ruim não derruba o lote nem se
 * corre o risco de estourar o tempo da função.
 */
export default function ImportNfForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportNfResult[]>([]);

  async function handleSend() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setResults([]);
    setProgress({ done: 0, total: files.length });
    const out: ImportNfResult[] = [];
    for (const [i, file] of files.entries()) {
      setProgress({ done: i, total: files.length });
      const fd = new FormData();
      fd.set("file", file);
      try {
        out.push(await importNfAction(fd));
      } catch {
        out.push({ ok: false, filename: file.name, error: "Falha ao enviar o arquivo." });
      }
      setResults([...out]);
    }
    setProgress(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const criadas = results.filter((r) => r.ok && !r.duplicated).length;
  const repetidas = results.filter((r) => r.duplicated).length;
  const falhas = results.filter((r) => !r.ok).length;

  return (
    <div className="space-y-4 p-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Arquivos das notas (PDF ou foto)
        </label>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf,image/*"
          disabled={busy}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-xs text-slate-500">
          Pode selecionar várias de uma vez. Cada nota é lida separadamente.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleSend} disabled={busy}>
          {busy ? "Lendo as notas..." : "Importar notas"}
        </Button>
        {progress ? (
          <span className="text-sm text-slate-500">
            Lendo {progress.done + 1} de {progress.total}…
          </span>
        ) : null}
      </div>

      {results.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            {criadas} criada(s)
            {repetidas > 0 ? ` · ${repetidas} já importada(s)` : ""}
            {falhas > 0 ? ` · ${falhas} com problema` : ""}
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {results.map((r, i) => (
              <li key={`${r.filename}-${i}`} className="px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{r.filename}</span>
                {r.ok && !r.duplicated ? (
                  <span className="text-emerald-700">
                    {" "}
                    → Solicitação {r.numero} · {r.supplier}
                    {r.total != null ? ` · ${formatCurrency(r.total)}` : ""}
                  </span>
                ) : null}
                {r.duplicated ? (
                  <span className="text-amber-700">
                    {" "}
                    → já importada (solicitação {r.numero})
                  </span>
                ) : null}
                {!r.ok ? <span className="text-rose-600"> → {r.error}</span> : null}
              </li>
            ))}
          </ul>
          {criadas > 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              As solicitações estão em <strong>Compras</strong>, pendentes e marcadas com
              <strong> “falta a placa”</strong>. Abra cada uma, escolha o veículo e aprove.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
