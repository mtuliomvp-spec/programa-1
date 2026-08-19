"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import {
  readDuplicatasAction,
  createDuplicatasAction,
  type ReadDuplicatasResult,
  type ImportDuplicatasResult,
} from "./actions";

const MAX_BYTES = 15 * 1024 * 1024;
const NEW_SUPPLIER = "__new__";

/**
 * "Importar NFs do fornecedor" em duas etapas: (1) a IA lê o PDF da relação de
 * duplicatas e mostra o fornecedor identificado + as parcelas; (2) o usuário
 * CONFIRMA o fornecedor (pode estar cadastrado com outro nome — ex.: "PMZ")
 * e o sistema cria os títulos que ainda não existem.
 */
export default function ImportDuplicatasButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [read, setRead] = useState<ReadDuplicatasResult | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportDuplicatasResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setError(null);
    setRead(null);
    setResult(null);
    setSupplierId("");
    setChecked(new Set());
  }

  async function handleFile(file: File) {
    reset();
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
      const res = await readDuplicatasAction(base64);
      if (!res.ok) {
        setError(res.error || "Não foi possível ler o relatório.");
        return;
      }
      setRead(res);
      setSupplierId(res.suggestedSupplierId ?? NEW_SUPPLIER);
      // Todas as parcelas vêm marcadas — o usuário desmarca as que não quer criar.
      setChecked(new Set((res.duplicatas ?? []).map((_, i) => i)));
    } catch {
      setError("Não foi possível importar. Tente novamente.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleCreate() {
    if (!read?.duplicatas) return;
    const selecionadas = read.duplicatas.filter((_, i) => checked.has(i));
    if (selecionadas.length === 0) {
      setError("Marque ao menos uma parcela para criar.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const res = await createDuplicatasAction({
        supplierId: supplierId === NEW_SUPPLIER ? null : supplierId,
        newSupplierName: supplierId === NEW_SUPPLIER ? read.fornecedorNome ?? null : null,
        cnpj: read.fornecedorCnpj ?? null,
        duplicatas: selecionadas,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setRead(null);
      setResult(res);
      router.refresh();
    } catch {
      setError("Não foi possível criar os títulos. Tente novamente.");
    } finally {
      setCreating(false);
    }
  }

  const open = Boolean(error || read || result);

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

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Importar NFs do fornecedor</h2>
            {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}

            {read ? (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-slate-600">
                    Fornecedor no relatório:{" "}
                    <strong>{read.fornecedorNome || "não identificado"}</strong>
                    {read.fornecedorCnpj ? ` · CNPJ ${read.fornecedorCnpj}` : ""}
                  </p>
                  <label className="mt-2 block text-xs font-medium text-slate-600">
                    Lançar os títulos no fornecedor
                    <Select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="mt-1"
                    >
                      <option value={NEW_SUPPLIER}>
                        ➕ Cadastrar &quot;{read.fornecedorNome || "novo fornecedor"}&quot;
                      </option>
                      {(read.suppliers ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className="mt-1 text-xs text-slate-400">
                    Confira: o fornecedor pode estar cadastrado com outro nome (ex.: PMZ). O CNPJ do
                    relatório é gravado no cadastro escolhido para a próxima importação casar sozinha.
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-700">
                      {read.duplicatas?.length ?? 0} parcela(s) encontrada(s) — marque as que quer
                      criar:
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const total = read.duplicatas?.length ?? 0;
                        setChecked((prev) =>
                          prev.size === total
                            ? new Set()
                            : new Set(Array.from({ length: total }, (_, i) => i)),
                        );
                      }}
                      className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
                    >
                      {checked.size === (read.duplicatas?.length ?? 0)
                        ? "Desmarcar todas"
                        : "Marcar todas"}
                    </button>
                  </div>
                  <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                    {(read.duplicatas ?? []).map((d, i) => (
                      <label key={i} className="flex items-start gap-2 text-slate-600">
                        <input
                          type="checkbox"
                          checked={checked.has(i)}
                          onChange={(e) => {
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(i);
                              else next.delete(i);
                              return next;
                            });
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <span>
                          NF {d.nota ?? d.fatura ?? "?"} parc. {d.parcela ?? 1}
                          {d.valor != null ? ` — ${formatCurrency(d.valor)}` : ""}
                          {d.vencimento ? ` (venc. ${d.vencimento})` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Mesmo entre as marcadas, as que já estiverem lançadas são puladas automaticamente.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={reset} disabled={creating}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleCreate} disabled={creating || checked.size === 0}>
                    {creating
                      ? "Criando títulos…"
                      : `Criar ${checked.size} título${checked.size === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </div>
            ) : null}

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
                    <p className="font-medium text-slate-600">{result.skipped.length} pulada(s):</p>
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

            {!read ? (
              <div className="mt-4 flex justify-end">
                <Button type="button" onClick={reset}>
                  Fechar
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
