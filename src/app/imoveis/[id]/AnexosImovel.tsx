"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import ConfirmButton from "@/components/ConfirmButton";
import { formatDate } from "@/lib/format";
import { CATEGORIAS_ANEXO_IMOVEL, rotuloCategoriaAnexo } from "@/lib/imoveis";
import { alterarAnexoImovelAction, excluirAnexoImovelAction, identificarAnexoImovelAction } from "../actions";
import { enviarAnexoImovel } from "../enviarAnexo";

export type AnexoImovel = {
  id: string;
  categoria: string;
  exercicio: number | null;
  description: string;
  filename: string;
  size: number;
  completo: boolean;
  createdAt: string;
};

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Documentos do imóvel, separados por tipo (e por ano, nos do ITR). O envio
 * vai em partes de 3 MB — registro de cartório escaneado costuma passar do
 * limite de uma requisição.
 */
export default function AnexosImovel({
  imovelId,
  anexos,
  podeCriar,
  podeEditar,
  podeExcluir,
}: {
  imovelId: string;
  anexos: AnexoImovel[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // "AUTO": a IA diz o tipo, o ano e a descrição de cada arquivo depois do envio.
  const [categoria, setCategoria] = useState<string>("AUTO");
  const [exercicio, setExercicio] = useState(String(new Date().getFullYear()));
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [lidos, setLidos] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const automatico = categoria === "AUTO";
  const porAno = CATEGORIAS_ANEXO_IMOVEL.find((c) => c.key === categoria)?.porAno ?? false;

  async function enviarUm(original: File, descricaoDoArquivo: string): Promise<string> {
    const id = await enviarAnexoImovel(
      original,
      {
        imovelId,
        categoria: automatico ? "OUTRO" : categoria,
        exercicio: porAno ? exercicio : undefined,
        description: descricaoDoArquivo,
      },
      (pct) => setEnviando(`Enviando ${original.name}${pct < 100 ? ` — ${pct}%` : ""}…`),
    );
    if (!automatico) return `${original.name}: anexado`;
    setEnviando(`Identificando ${original.name}…`);
    const r = await identificarAnexoImovelAction(id, Boolean(descricaoDoArquivo));
    return r.ok
      ? `${original.name}: ${r.resumo}`
      : `${original.name}: anexado como "Outro documento" — ${(r.error || "não identifiquei").replace(/\.+$/, "")}. Ajuste o tipo em "Editar".`;
  }

  async function enviar() {
    const arquivos = Array.from(fileRef.current?.files ?? []);
    if (!arquivos.length) return;
    setErro(null);
    setOk(null);
    setLidos([]);
    try {
      const resultado: string[] = [];
      for (const f of arquivos) {
        // Vários arquivos de uma vez: cada um leva o próprio nome como descrição.
        resultado.push(await enviarUm(f, arquivos.length === 1 ? descricao : ""));
        setLidos([...resultado]);
      }
      setOk(arquivos.length === 1 ? "Documento anexado." : `${arquivos.length} documentos anexados.`);
      setDescricao("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível anexar.");
      router.refresh();
    } finally {
      setEnviando(null);
    }
  }

  // Agrupa por categoria, na ordem das categorias; dentro, o ano mais novo primeiro.
  const grupos = CATEGORIAS_ANEXO_IMOVEL.map((c) => ({
    ...c,
    itens: anexos
      .filter((a) => a.categoria === c.key)
      .sort((a, b) => (b.exercicio ?? 0) - (a.exercicio ?? 0) || b.createdAt.localeCompare(a.createdAt)),
  })).filter((g) => g.itens.length > 0);

  return (
    <div className="space-y-4 p-5">
      {grupos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum documento anexado ainda.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
            <ul className="mt-1 divide-y divide-slate-100">
              {g.itens.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {a.exercicio ? <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.exercicio}</span> : null}
                      {a.description}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {a.filename} · {tamanho(a.size)} · {formatDate(a.createdAt)}
                      {!a.completo ? <span className="ml-1 font-medium text-rose-600">· envio incompleto</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    {a.completo ? (
                      <>
                        <a href={`/imoveis/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">
                          Abrir
                        </a>
                        <a href={`/imoveis/anexos/${a.id}?download=1`} className="text-slate-600 hover:underline">
                          Baixar
                        </a>
                      </>
                    ) : null}
                    {podeEditar && a.completo ? (
                      <button
                        type="button"
                        onClick={() => setEditando(editando === a.id ? null : a.id)}
                        className="text-slate-600 hover:underline"
                      >
                        Editar
                      </button>
                    ) : null}
                    {podeExcluir || (!a.completo && podeCriar) ? (
                      <ConfirmButton
                        confirmLabel="Excluir"
                        question={`Excluir "${a.description}"?`}
                        onConfirm={async () => {
                          const r = await excluirAnexoImovelAction(a.id);
                          if (!r.ok) setErro(r.error || "Não foi possível excluir.");
                          router.refresh();
                        }}
                        className="font-medium text-rose-600 hover:underline"
                      >
                        Excluir
                      </ConfirmButton>
                    ) : null}
                  </div>
                  {editando === a.id ? (
                    <EditarAnexo
                      anexo={a}
                      onFim={(erroEdicao) => {
                        if (erroEdicao) setErro(erroEdicao);
                        setEditando(null);
                        router.refresh();
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {podeCriar ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Tipo do documento">
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="AUTO">🤖 Identificar automaticamente</option>
                {CATEGORIAS_ANEXO_IMOVEL.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            {porAno ? (
              <Field label="Exercício (ano)">
                <Input value={exercicio} onChange={(e) => setExercicio(e.target.value)} inputMode="numeric" maxLength={4} />
              </Field>
            ) : null}
            <Field label="Descrição (opcional)">
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={automatico ? "a IA descreve o documento" : rotuloCategoriaAnexo(categoria)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,image/*,.doc,.docx,.dwg,.kml,.kmz,.zip"
              className="block w-full max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
            />
            <Button type="button" onClick={enviar} disabled={!!enviando}>
              {enviando ? "Enviando…" : "Anexar"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Pode escolher vários arquivos de uma vez. Em &quot;Identificar automaticamente&quot;, a IA diz o tipo e o
            ano de cada um (declaração e recibo do ITR, DARF, comprovante…) e, no registro, completa os campos vazios
            da ficha. Arquivos grandes, como o registro do cartório escaneado, sobem em partes — até 60 MB.
          </p>
          {enviando ? <p className="text-sm text-slate-600">⏳ {enviando}</p> : null}
          {erro ? <p className="text-sm text-rose-700">{erro}</p> : null}
          {ok ? <p className="text-sm text-emerald-700">✓ {ok}</p> : null}
          {lidos.length ? (
            <ul className="list-disc pl-5 text-xs text-slate-600">
              {lidos.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Corrige o tipo, o ano ou a descrição de um documento. */
function EditarAnexo({ anexo, onFim }: { anexo: AnexoImovel; onFim: (erro?: string) => void }) {
  const [categoria, setCategoria] = useState(anexo.categoria);
  const [exercicio, setExercicio] = useState(anexo.exercicio ? String(anexo.exercicio) : "");
  const [descricao, setDescricao] = useState(anexo.description);
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="mt-2 grid w-full grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_6rem_1fr_auto]">
      <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        {CATEGORIAS_ANEXO_IMOVEL.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
      <Input value={exercicio} onChange={(e) => setExercicio(e.target.value)} placeholder="Ano" inputMode="numeric" maxLength={4} />
      <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      <Button
        type="button"
        disabled={salvando}
        onClick={async () => {
          setSalvando(true);
          const r = await alterarAnexoImovelAction({ id: anexo.id, categoria, exercicio, description: descricao });
          setSalvando(false);
          onFim(r.ok ? undefined : r.error || "Não foi possível salvar.");
        }}
      >
        {salvando ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}
