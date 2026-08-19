"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { importPaymentReceiptsAction, type ImportReceiptsResult } from "./actions";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * "Importar comprovantes": envia um PDF de comprovantes de pagamento (lote do
 * banco) e o sistema anexa automaticamente cada comprovante ao título PAGO
 * correspondente (mesmo valor, data próxima). O que não casar volta listado
 * para anexar manualmente.
 */
export default function ImportReceiptsButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportReceiptsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    if (file.type !== "application/pdf") {
      setError("Envie o PDF de comprovantes (arquivo .pdf).");
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
      const res = await importPaymentReceiptsAction(base64);
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
        {busy ? "Lendo comprovantes…" : "📎 Importar comprovantes"}
      </Button>

      {error || result ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Importar comprovantes</h2>
            {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}
            {result ? (
              <div className="mt-3 space-y-3 text-sm">
                {result.attached.length > 0 ? (
                  <div>
                    <p className="font-medium text-emerald-700">
                      ✓ {result.attached.length} comprovante(s) anexado(s):
                    </p>
                    <ul className="mt-1 list-inside list-disc text-slate-700">
                      {result.attached.map((a, i) => (
                        <li key={i}>
                          {a.receipt} → <strong>{a.title}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="font-medium text-amber-700">Nenhum comprovante casou automaticamente.</p>
                )}
                {result.unmatched.length > 0 ? (
                  <div>
                    <p className="font-medium text-amber-700">
                      ⚠ {result.unmatched.length} sem correspondência (anexe manualmente no título):
                    </p>
                    <ul className="mt-1 list-inside list-disc text-slate-600">
                      {result.unmatched.map((u, i) => (
                        <li key={i}>
                          {u.receipt} — <span className="text-slate-500">{u.reason}</span>
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
