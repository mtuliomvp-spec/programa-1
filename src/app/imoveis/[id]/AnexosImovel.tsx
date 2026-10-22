"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import ConfirmButton from "@/components/ConfirmButton";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { CATEGORIAS_ANEXO_IMOVEL, PARTE_UPLOAD_IMOVEL, rotuloCategoriaAnexo } from "@/lib/imoveis";
import { continuarAnexoImovelAction, excluirAnexoImovelAction, iniciarAnexoImovelAction } from "../actions";

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
  podeExcluir,
}: {
  imovelId: string;
  anexos: AnexoImovel[];
  podeCriar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState<string>("ESCRITURA");
  const [exercicio, setExercicio] = useState(String(new Date().getFullYear()));
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const porAno = CATEGORIAS_ANEXO_IMOVEL.find((c) => c.key === categoria)?.porAno ?? false;

  async function enviarUm(original: File, descricaoDoArquivo: string) {
    const file = original.type.startsWith("image/") ? await resizeImageToJpeg(original) : original;
    let id: string | null = null;
    for (let offset = 0; offset < file.size; offset += PARTE_UPLOAD_IMOVEL) {
      const parte = file.slice(offset, offset + PARTE_UPLOAD_IMOVEL);
      const fd = new FormData();
      fd.set("parte", parte);
      setEnviando(
        `Enviando ${original.name}${file.size > PARTE_UPLOAD_IMOVEL ? ` — ${Math.min(100, Math.round(((offset + parte.size) / file.size) * 100))}%` : ""}…`,
      );
      let r;
      if (!id) {
        fd.set("imovelId", imovelId);
        fd.set("categoria", categoria);
        if (porAno) fd.set("exercicio", exercicio);
        fd.set("description", descricaoDoArquivo);
        fd.set("filename", file.name || original.name);
        fd.set("mimeType", file.type || original.type);
        fd.set("size", String(file.size));
        r = await iniciarAnexoImovelAction(fd);
        id = r.id ?? null;
      } else {
        fd.set("id", id);
        fd.set("offset", String(offset));
        r = await continuarAnexoImovelAction(fd);
      }
      if (!r.ok) {
        // O pedaço que já subiu não serve para nada: sai.
        if (id) await excluirAnexoImovelAction(id);
        throw new Error(`${original.name}: ${r.error || "falha no envio"}`);
      }
    }
  }

  async function enviar() {
    const arquivos = Array.from(fileRef.current?.files ?? []);
    if (!arquivos.length) return;
    setErro(null);
    setOk(null);
    try {
      for (const f of arquivos) {
        // Vários arquivos de uma vez: cada um leva o próprio nome como descrição.
        await enviarUm(f, arquivos.length === 1 ? descricao : "");
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
                placeholder={rotuloCategoriaAnexo(categoria)}
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
            Pode escolher vários arquivos de uma vez (todos entram no tipo escolhido). Arquivos grandes, como
            o registro do cartório escaneado, sobem em partes — até 60 MB.
          </p>
          {enviando ? <p className="text-sm text-slate-600">⏳ {enviando}</p> : null}
          {erro ? <p className="text-sm text-rose-700">{erro}</p> : null}
          {ok ? <p className="text-sm text-emerald-700">✓ {ok}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
