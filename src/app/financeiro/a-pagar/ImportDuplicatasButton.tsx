"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { importDuplicatasAction, type ImportDuplicatasResult } from "./actions";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * "Importar NFs do fornecedor": envia o PDF da relação de duplicatas em aberto
 * e o sistema cria os títulos a pagar que ainda não existem (NF, parcela,
 * vencimento, valor e fornecedor preenchidos). O que já está lançado é pulado.
 * Falta só editar cada título para vincular o veículo/peça.
 */
export default function ImportDuplicatasButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportDuplicatasResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    if (file.type !== "application/pdf") {
      setError("Envie o relatório de duplicatas em PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Arquivo muito grande (máximo 15 MB).");
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        r.readAsDataURL(file);
      });
      const res = await importDuplicatasAction(base64);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res);
      router.refresh();
    } catch {
      setError("Não foi possível importar. Tente novamente.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? "Lendo o relatório…" : "🧾 Importar NFs do fornecedor"}
      </Button>

      {error || result ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Importar NFs do fornecedor</h2>
            {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}
            {result ? (
              <div className="mt-3 space-y-3 text-sm">
                {result.created.length > 0 ? (
                  <div>
                    <p className="font-medium text-emerald-700">
                      ✓ {result.created.length} título(s) criado(s) — edite cada um para vincular o
                      veículo/peça:
                    </p>
                    <ul className="mt-1 list-inside list-disc text-slate-700">
                      {result.created.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="font-medium text-amber-700">Nenhum título novo — tudo já estava lançado.</p>
                )}
                {result.skipped.length > 0 ? (
                  <div>
                    <p className="font-medium text-slate-600">
                      {result.skipped.length} pulada(s):
                    </p>
                    <ul className="mt-1 list-inside list-disc text-slate-600">
                      {result.skipped.map((s, i) => (
                        <li key={i}>
                          {s.title} — <span className="text-slate-500">{s.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setResult(null);
                }}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
