"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { APP_BACKUP, FORMATO_BACKUP, type ModoBackup } from "@/lib/backup/formato";
import {
  planoBackupAction,
  loteBackupAction,
  iniciarRestauracaoAction,
  loteRestauracaoAction,
  finalizarRestauracaoAction,
} from "./backup-actions";
import { restoreBackupAction } from "./actions";

/**
 * Backup e restauração feitos pelo navegador, em lotes pequenos (a Vercel
 * recusa requisições acima de ~4,5 MB). O arquivo é uma linha JSON por
 * registro, com os documentos em base64.
 */

type Meta = { app: string; formato: number; modo: ModoBackup; geradoEm: string; versao?: string; total?: number };

const LOTE_LINHAS = 200;
const LOTE_BYTES = 3_000_000;

function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function base64ParaBlob(s: string): Blob {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]);
}

/** Lê o arquivo linha a linha, sem carregar tudo como um texto só. */
async function* linhasDoArquivo(file: File) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let resto = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    resto += value;
    let i: number;
    while ((i = resto.indexOf("\n")) >= 0) {
      const linha = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (linha) yield linha;
    }
  }
  if (resto.trim()) yield resto.trim();
}

async function lerCabecalho(file: File): Promise<Meta | "antigo" | null> {
  const inicio = (await file.slice(0, 4096).text()).trimStart();
  if (/^\{\s*\n/.test(inicio) || inicio.startsWith('{\r\n') || inicio.includes('"_meta"')) return "antigo";
  const primeira = inicio.split("\n")[0];
  try {
    const meta = JSON.parse(primeira) as Meta;
    return meta?.app === APP_BACKUP ? meta : null;
  } catch {
    return null;
  }
}

export default function BackupPanel({ demo }: { demo: boolean }) {
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [cabecalho, setCabecalho] = useState<Meta | "antigo" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function limparAvisos() {
    setErro(null);
    setSucesso(null);
    setProgresso(null);
  }

  async function exportar(modo: ModoBackup) {
    limparAvisos();
    setOcupado(true);
    try {
      const sal = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      const plano = await planoBackupAction(modo);
      if (!plano.ok || !plano.modelos) throw new Error(plano.erro || "Não foi possível começar o backup.");
      const total = plano.modelos.reduce((s, m) => s + m.total, 0);
      const meta: Meta = {
        app: APP_BACKUP,
        formato: FORMATO_BACKUP,
        modo,
        geradoEm: new Date().toISOString(),
        versao: process.env.NEXT_PUBLIC_APP_VERSION,
        total,
      };
      const partes: string[] = [JSON.stringify(meta) + "\n"];
      let feitas = 0;
      for (const m of plano.modelos) {
        if (!m.total) continue;
        let depoisDe: string | null = null;
        for (;;) {
          const lote = await loteBackupAction({ modelo: m.nome, depoisDe, modo, sal });
          if (!lote.ok || !lote.linhas) throw new Error(lote.erro || `Falhou ao ler a tabela ${m.nome}.`);
          for (const linha of lote.linhas) {
            // Documentos do backup completo descem um por um.
            for (const [campo, v] of Object.entries(linha)) {
              if (v && typeof v === "object" && "$arq" in (v as object)) {
                const res = await fetch(
                  `/sistema/backup/arquivo?m=${encodeURIComponent(m.nome)}&id=${encodeURIComponent(String(linha.id))}&f=${encodeURIComponent(campo)}`,
                );
                if (!res.ok) throw new Error(`Não consegui baixar um arquivo da tabela ${m.nome}.`);
                linha[campo] = { $b64: await blobParaBase64(await res.blob()) };
              }
            }
            partes.push(JSON.stringify({ m: m.nome, r: linha }) + "\n");
          }
          feitas += lote.linhas.length;
          setProgresso(`Lendo ${m.nome}… ${feitas} de ${total} registros`);
          if (!lote.proximo) break;
          depoisDe = lote.proximo;
        }
      }
      const blob = new Blob(partes, { type: "application/x-ndjson" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `backup-${modo === "completo" ? "completo" : "demonstracao"}-${carimbo}.jsonl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setProgresso(null);
      setSucesso(
        modo === "completo"
          ? `Backup completo baixado (${feitas} registros, ${(blob.size / 1024 / 1024).toFixed(1)} MB). Guarde em lugar seguro: tem dados reais.`
          : `Backup para demonstração baixado (${feitas} registros). Nomes, documentos, contatos, placas e arquivos foram disfarçados. Restaure-o na instalação de demonstração.`,
      );
    } catch (e) {
      setProgresso(null);
      setErro(e instanceof Error ? e.message : "Falha no backup.");
    } finally {
      setOcupado(false);
    }
  }

  async function escolher(file: File | null) {
    limparAvisos();
    setArquivo(file);
    setCabecalho(file ? await lerCabecalho(file) : null);
  }

  async function restaurar() {
    if (!arquivo || !cabecalho) return;
    limparAvisos();
    setOcupado(true);
    try {
      if (cabecalho === "antigo") {
        const fd = new FormData();
        fd.set("backup", arquivo);
        const r = await restoreBackupAction({}, fd);
        if (r.error) throw new Error(r.error);
        setSucesso(r.success || "Backup restaurado.");
        return;
      }
      const inicio = await iniciarRestauracaoAction(cabecalho);
      if (!inicio.ok || !inicio.passe) throw new Error(inicio.erro || "Não foi possível começar a restauração.");
      const passe = inicio.passe;

      let modelo = "";
      let linhas: Record<string, unknown>[] = [];
      let arquivos: Blob[] = [];
      let tamanho = 0;
      let gravadas = 0;
      const total = cabecalho.total ?? 0;

      const gravar = async () => {
        if (!linhas.length) return;
        const fd = new FormData();
        fd.set("passe", passe);
        fd.set("modelo", modelo);
        fd.set("linhas", JSON.stringify(linhas));
        arquivos.forEach((b, i) => fd.set(`f${i}`, b));
        const r = await loteRestauracaoAction(fd);
        if (!r.ok) throw new Error(`${r.erro} A restauração parou no meio: restaure o arquivo de novo.`);
        gravadas += linhas.length;
        setProgresso(`Gravando ${modelo}… ${gravadas}${total ? ` de ${total}` : ""} registros`);
        linhas = [];
        arquivos = [];
        tamanho = 0;
      };

      let primeira = true;
      for await (const texto of linhasDoArquivo(arquivo)) {
        if (primeira) {
          primeira = false; // cabeçalho
          continue;
        }
        const { m, r } = JSON.parse(texto) as { m: string; r: Record<string, unknown> };
        if (m !== modelo) {
          await gravar();
          modelo = m;
        }
        let pesoArquivos = 0;
        const novos: Blob[] = [];
        for (const [campo, v] of Object.entries(r)) {
          if (v && typeof v === "object" && "$b64" in (v as object)) {
            const blob = base64ParaBlob(String((v as { $b64: string }).$b64));
            novos.push(blob);
            pesoArquivos += blob.size;
            r[campo] = { $arq: "" }; // a chave da parte é definida abaixo
          }
        }
        const peso = JSON.stringify(r).length + pesoArquivos;
        if (linhas.length && (linhas.length >= LOTE_LINHAS || tamanho + peso > LOTE_BYTES)) await gravar();
        // Numera as partes binárias dentro do lote atual.
        let k = 0;
        for (const [campo, v] of Object.entries(r)) {
          if (v && typeof v === "object" && "$arq" in (v as object)) {
            r[campo] = { $arq: `f${arquivos.length}` };
            arquivos.push(novos[k++]);
          }
        }
        linhas.push(r);
        tamanho += peso;
      }
      await gravar();

      const fim = await finalizarRestauracaoAction(passe);
      if (!fim.ok) throw new Error(fim.erro);
      setProgresso(null);
      setSucesso(
        `Backup restaurado: ${gravadas} registros.${
          cabecalho.modo === "completo" ? " Se os usuários mudaram, entre de novo." : " Usuários e parâmetros desta demonstração foram mantidos."
        }`,
      );
      setArquivo(null);
      setCabecalho(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setProgresso(null);
      setErro(e instanceof Error ? e.message : "Falha na restauração.");
    } finally {
      setOcupado(false);
    }
  }

  const recusado =
    cabecalho && cabecalho !== "antigo"
      ? demo && cabecalho.modo !== "demonstracao"
        ? "Este é um backup COMPLETO, com dados reais. A demonstração só aceita o backup para demonstração (disfarçado)."
        : !demo && cabecalho.modo !== "completo"
          ? "Este é um backup disfarçado, feito para a demonstração. Aqui ele trocaria os dados reais por fictícios."
          : null
      : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => exportar("completo")}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          💾 Backup completo
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => exportar("demonstracao")}
          className="flex items-center justify-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800 shadow-sm hover:bg-violet-100 disabled:opacity-60"
        >
          🎭 Backup para demonstração
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            setMostrarRestaurar((v) => !v);
            limparAvisos();
          }}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 sm:col-span-2"
        >
          ⬆️ Restaurar backup
        </button>
      </div>

      {mostrarRestaurar ? (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Restaurar a partir de um backup</p>
          <p className="mt-1 text-sm text-slate-600">
            {demo ? (
              <>
                Esta é a <strong>demonstração</strong>: escolha o arquivo do{" "}
                <strong>🎭 Backup para demonstração</strong> feito na produção. Os dados de negócio
                daqui são substituídos; os usuários e os parâmetros desta demonstração ficam.
              </>
            ) : (
              <>
                Escolha um arquivo do <strong>💾 Backup completo</strong>.{" "}
                <strong>Isto substitui todos os dados atuais</strong>, inclusive usuários e
                parâmetros. Faça um backup do estado atual antes.
              </>
            )}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json,application/json,application/x-ndjson"
            disabled={ocupado}
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            className="mt-3 block text-sm"
          />
          {arquivo && cabecalho === null ? (
            <p className="mt-2 text-sm font-medium text-rose-700">Este arquivo não é um backup deste sistema.</p>
          ) : null}
          {cabecalho && cabecalho !== "antigo" ? (
            <p className="mt-2 text-sm text-slate-700">
              {cabecalho.modo === "demonstracao" ? "🎭 Backup para demonstração" : "💾 Backup completo"} de{" "}
              {new Date(cabecalho.geradoEm).toLocaleString("pt-BR")}
              {cabecalho.versao ? ` · versão ${cabecalho.versao}` : ""}
              {cabecalho.total ? ` · ${cabecalho.total} registros` : ""}
              {cabecalho.versao && process.env.NEXT_PUBLIC_APP_VERSION && cabecalho.versao !== process.env.NEXT_PUBLIC_APP_VERSION
                ? ` (este sistema está na versão ${process.env.NEXT_PUBLIC_APP_VERSION})`
                : ""}
            </p>
          ) : null}
          {cabecalho === "antigo" ? (
            <p className="mt-2 text-sm text-amber-800">
              Backup no formato antigo (.json). Ele pode falhar se for grande ou se o sistema já
              usava combos, notas e anexos de títulos — prefira um backup novo.
            </p>
          ) : null}
          {recusado ? <p className="mt-2 text-sm font-medium text-rose-700">{recusado}</p> : null}
          {arquivo && cabecalho && !recusado ? (
            <Button type="button" className="mt-3 bg-rose-600 hover:bg-rose-700" disabled={ocupado} onClick={restaurar}>
              {ocupado ? "Restaurando…" : "Apagar os dados atuais e restaurar"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {progresso ? <p className="text-sm text-slate-600">⏳ {progresso} — não feche esta página.</p> : null}
      {erro ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p> : null}
      {sucesso ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sucesso}</p>
      ) : null}
    </div>
  );
}
