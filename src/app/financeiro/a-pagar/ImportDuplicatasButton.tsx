"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import {
  readDuplicatasAction,
  createDuplicatasAction,
  readNfeAction,
  applyNfeAction,
  type ReadDuplicatasResult,
  type ImportDuplicatasResult,
  type NfeNotaPlano,
  type ImportNfeResult,
} from "./actions";

const MAX_BYTES = 15 * 1024 * 1024;
const NEW_SUPPLIER = "__new__";

/** Uma nota lida, com as escolhas que o usuário fez na revisão. */
type NotaRevisao = NfeNotaPlano & {
  arquivo: number; // índice do arquivo de onde veio
  escolhaFornecedor: string; // id do fornecedor ou NEW_SUPPLIER
  marcadas: Set<number>; // parcelas marcadas (por número da parcela)
};

type ArquivoLido = { nome: string; base64: string; totalNotas: number };

/** DANFE/NF-e baixada tem "procNFe" ou a chave de 44 dígitos no nome. */
function looksLikeNfe(name: string): boolean {
  return /procnfe/i.test(name) || /\d{44}/.test(name);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    r.readAsDataURL(file);
  });
}

/**
 * "Importar NFs do fornecedor" em duas etapas, para os dois tipos de arquivo:
 *
 *  • NF-e/DANFE: a IA lê as notas e o sistema mostra, parcela a parcela, o que
 *    vai acontecer (criar título novo ou anexar a um já lançado). Nada entra no
 *    financeiro antes do "Confirmar e lançar" — antes o título era criado
 *    direto, e um número errado da leitura entrava sem ninguém ver.
 *  • Relatório de duplicatas: a IA lê e o usuário confirma o fornecedor (pode
 *    estar cadastrado com outro nome) e as parcelas.
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

  // Revisão das NF-e
  const [arquivos, setArquivos] = useState<ArquivoLido[]>([]);
  const [notas, setNotas] = useState<NotaRevisao[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; name: string }[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<string[] | null>(null);

  function reset() {
    setError(null);
    setRead(null);
    setResult(null);
    setSupplierId("");
    setChecked(new Set());
    setArquivos([]);
    setNotas([]);
    setFornecedores([]);
    setAvisos([]);
    setOutcomes(null);
  }

  async function handleFiles(files: File[]) {
    reset();
    for (const f of files) {
      if (f.type !== "application/pdf") {
        setError("Envie PDFs (relatório de duplicatas ou NF-e/DANFE).");
        return;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" é muito grande (máximo 15 MB).`);
        return;
      }
    }
    setBusy(true);
    try {
      const ehNfe = files.every((f) => looksLikeNfe(f.name)) || files.length > 1;
      if (ehNfe) {
        const lidos: ArquivoLido[] = [];
        const encontradas: NotaRevisao[] = [];
        const todosAvisos: string[] = [];
        let cadastro: { id: string; name: string }[] = [];
        for (const f of files) {
          const base64 = await fileToBase64(f);
          const res = await readNfeAction(base64);
          if (!res.ok || !res.notas) {
            todosAvisos.push(`${f.name}: ${res.error || "não foi possível ler."}`);
            continue;
          }
          lidos.push({ nome: f.name, base64, totalNotas: res.notas.length });
          if (res.suppliers?.length) cadastro = res.suppliers;
          todosAvisos.push(...(res.avisos ?? []));
          for (const n of res.notas) {
            encontradas.push({
              ...n,
              arquivo: lidos.length - 1,
              escolhaFornecedor: n.supplierId ?? NEW_SUPPLIER,
              // Tudo marcado; o usuário desmarca o que não quiser lançar.
              marcadas: new Set(n.parcelas.map((p) => p.parcela)),
            });
          }
        }
        if (encontradas.length === 0) {
          setError(todosAvisos[0] || "Nenhuma nota utilizável nos arquivos enviados.");
          return;
        }
        setArquivos(lidos);
        setNotas(encontradas);
        setFornecedores(cadastro);
        setAvisos(todosAvisos);
        return;
      }

      const base64 = await fileToBase64(files[0]);
      const res = await readDuplicatasAction(base64);
      if (!res.ok) {
        setError(res.error || "Não foi possível ler o relatório.");
        return;
      }
      setRead(res);
      setSupplierId(res.suggestedSupplierId ?? NEW_SUPPLIER);
      setChecked(new Set((res.duplicatas ?? []).map((_, i) => i)));
    } catch {
      setError("Não foi possível importar. Tente novamente.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const marcadasTotal = notas.reduce((s, n) => s + n.marcadas.size, 0);

  async function confirmarNfe() {
    if (marcadasTotal === 0) {
      setError("Marque ao menos uma parcela para lançar.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const saida: string[] = [];
      for (const [i, arq] of arquivos.entries()) {
        const doArquivo = notas
          .filter((n) => n.arquivo === i)
          .map((n) => ({
            numero: n.numero,
            emitenteNome: n.emitenteNome,
            emitidaEm: n.emitidaEm,
            paginaInicial: n.paginaInicial,
            paginaFinal: n.paginaFinal,
            itensResumo: n.itensResumo,
            supplierId: n.escolhaFornecedor === NEW_SUPPLIER ? null : n.escolhaFornecedor,
            newSupplierName: n.escolhaFornecedor === NEW_SUPPLIER ? n.emitenteNome : null,
            parcelas: n.parcelas.filter((p) => n.marcadas.has(p.parcela)),
          }))
          .filter((n) => n.parcelas.length > 0);
        if (doArquivo.length === 0) continue;
        const res: ImportNfeResult = await applyNfeAction({
          base64: arq.base64,
          filename: arq.nome,
          totalNotas: arq.totalNotas,
          notas: doArquivo,
        });
        if (!res.ok) {
          setError(res.error || "Não foi possível lançar.");
          return;
        }
        saida.push(...res.outcomes);
      }
      setNotas([]);
      setArquivos([]);
      setOutcomes(saida);
      router.refresh();
    } catch {
      setError("Não foi possível lançar os títulos. Tente novamente.");
    } finally {
      setCreating(false);
    }
  }

  function alternarParcela(notaIdx: number, parcela: number) {
    setNotas((prev) =>
      prev.map((n, i) => {
        if (i !== notaIdx) return n;
        const marcadas = new Set(n.marcadas);
        if (marcadas.has(parcela)) marcadas.delete(parcela);
        else marcadas.add(parcela);
        return { ...n, marcadas };
      }),
    );
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

  const emRevisaoNfe = notas.length > 0;
  const open = Boolean(error || read || result || emRevisaoNfe || outcomes);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) void handleFiles(fs);
        }}
      />
      <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? "Lendo as notas…" : "🧾 Importar NFs do fornecedor"}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Importar NFs do fornecedor</h2>
            {error ? <p className="mt-3 text-sm font-medium text-rose-600">{error}</p> : null}

            {/* ---------------- Revisão das NF-e (antes de lançar) ---------------- */}
            {emRevisaoNfe ? (
              <div className="mt-3 space-y-4 text-sm">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <strong>Nada foi lançado ainda.</strong> Confira as notas abaixo, desmarque o que
                  não quiser e confirme no fim.
                </p>

                {notas.map((n, i) => (
                  <div key={`${n.numero}-${i}`} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-800">
                      NF {n.numero}
                      {n.emitidaEm ? (
                        <span className="font-normal text-slate-500"> · emitida {n.emitidaEm}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      Emitente: {n.emitenteNome || "não identificado"}
                      {n.emitenteCnpj ? ` · CNPJ ${n.emitenteCnpj}` : ""}
                    </p>

                    <label className="mt-2 block text-xs font-medium text-slate-600">
                      Lançar no fornecedor
                      <Select
                        value={n.escolhaFornecedor}
                        onChange={(e) =>
                          setNotas((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, escolhaFornecedor: e.target.value } : x,
                            ),
                          )
                        }
                        className="mt-1"
                      >
                        <option value={NEW_SUPPLIER}>
                          ➕ Cadastrar &quot;{n.emitenteNome || "novo fornecedor"}&quot;
                        </option>
                        {fornecedores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    {n.supplierId ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Casou pelo CNPJ com <strong>{n.supplierNome}</strong>.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-700">
                        Nenhum cadastro casou pelo CNPJ — confira antes de lançar.
                      </p>
                    )}

                    {n.itensResumo ? (
                      <p className="mt-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Itens:</span>{" "}
                        {n.itensResumo.length > 220
                          ? `${n.itensResumo.slice(0, 220)}…`
                          : n.itensResumo}
                      </p>
                    ) : null}

                    <div className="mt-2 space-y-1">
                      {n.parcelas.map((p) => (
                        <label key={p.parcela} className="flex items-start gap-2 text-slate-700">
                          <input
                            type="checkbox"
                            checked={n.marcadas.has(p.parcela)}
                            onChange={() => alternarParcela(i, p.parcela)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300"
                          />
                          <span>
                            Parcela {p.parcela}/{p.total} — <strong>{formatCurrency(p.valor)}</strong>{" "}
                            (venc. {p.vencimento})
                            <span
                              className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                p.acao === "CRIAR"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {p.acao === "CRIAR"
                                ? "cria título novo"
                                : `anexa ao título nº ${p.tituloExistente}`}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {avisos.length > 0 ? (
                  <ul className="list-inside list-disc text-xs text-amber-700">
                    {avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={reset} disabled={creating}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={confirmarNfe} disabled={creating || marcadasTotal === 0}>
                    {creating
                      ? "Lançando…"
                      : `Confirmar e lançar ${marcadasTotal} parcela${marcadasTotal === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* ---------------- Revisão do relatório de duplicatas ---------------- */}
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

            {/* ---------------- Resultado ---------------- */}
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

            {outcomes ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="font-medium text-emerald-700">✓ Lançamento concluído:</p>
                <ul className="list-inside list-disc text-slate-700">
                  {outcomes.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-400">
                  Nos títulos criados, as peças da nota já estão na descrição/observações — falta só
                  vincular o veículo.
                </p>
              </div>
            ) : null}

            {!read && !emRevisaoNfe ? (
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
