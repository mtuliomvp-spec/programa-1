"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { importNfAction, type ImportNfResult } from "./actions";

/**
 * Envia as notas UMA POR VEZ, mostrando o progresso: a leitura por IA leva
 * alguns segundos por nota, e assim uma nota ruim não derruba o lote nem se
 * corre o risco de estourar o tempo da função.
 *
 * Foto passa por `resizeImageToJpeg` antes de subir. Isso resolve dois
 * problemas de uma vez: a foto do iPhone chega em HEIC (formato que a leitura
 * não aceita) e vira JPEG ao ser reencodada pelo próprio navegador; e uma foto
 * de vários MB encolhe, para não encostar no limite do envio. PDF passa
 * intacto.
 */
export default function ImportNfForm() {
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportNfResult[]>([]);

  function addFrom(input: HTMLInputElement | null) {
    const picked = Array.from(input?.files ?? []);
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked]);
    setResults([]);
    if (input) input.value = "";
  }

  async function handleSend() {
    if (files.length === 0) return;
    setBusy(true);
    setResults([]);
    const out: ImportNfResult[] = [];
    for (const [i, original] of files.entries()) {
      setProgress({ done: i, total: files.length });
      // 2400 px e qualidade alta: a letra da nota é miúda (mesmo ajuste do CRLV).
      const file = await resizeImageToJpeg(original, 2400, 0.92);
      const fd = new FormData();
      fd.set("file", file);
      try {
        out.push(await importNfAction(fd));
      } catch {
        out.push({ ok: false, filename: original.name, error: "Falha ao enviar o arquivo." });
      }
      setResults([...out]);
    }
    setProgress(null);
    setBusy(false);
    setFiles([]);
  }

  const criadas = results.filter((r) => r.ok && !r.duplicated).length;
  const repetidas = results.filter((r) => r.duplicated).length;
  const falhas = results.filter((r) => !r.ok).length;

  return (
    <div className="space-y-4 p-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Notas (PDF ou foto)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={pickRef}
            type="file"
            multiple
            accept="application/pdf,.pdf,image/*"
            disabled={busy}
            onChange={() => addFrom(pickRef.current)}
            className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          {/* Abre a câmera direto no celular; no computador vira um seletor comum. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={() => addFrom(cameraRef.current)}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            📷 Tirar foto da nota
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Pode juntar várias — cada nota é lida separadamente. Dá para fotografar a nota; quando
          tiver o PDF, prefira ele: a leitura sai mais exata.
        </p>
      </div>

      {files.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-slate-700">{f.name}</span>
              {!busy ? (
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, k) => k !== i))}
                  className="shrink-0 text-xs text-rose-600 hover:underline"
                >
                  Remover
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleSend} disabled={busy || files.length === 0}>
          {busy
            ? "Lendo as notas..."
            : files.length > 1
              ? `Importar ${files.length} notas`
              : "Importar nota"}
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
