import "server-only";
import { inflateSync } from "node:zlib";
import { chaveNfeDvOk } from "@/lib/renave";

/**
 * Texto de um PDF, sem depender de biblioteca externa nem de IA.
 *
 * Não é um extrator completo (fonte com subconjunto de glifos e string em
 * hexadecimal ficam de fora) — é o suficiente para o que interessa aqui: achar
 * a CHAVE DE ACESSO impressa num DANFE. Emissores de nota costumam gerar o PDF
 * com o texto em literais `(...)`, comprimido ou não.
 *
 * As partes são coladas SEM espaço: um número quebrado em pedaços pelo gerador
 * do PDF ("3126" "0816" …) volta a ser um número só, que é como a chave
 * aparece.
 */
export function textoDoPdf(buffer: Buffer): string {
  const bin = buffer.toString("latin1");
  const partes: string[] = [];
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bin)) !== null) {
    const inicio = m.index + m[0].length;
    const fim = bin.indexOf("endstream", inicio);
    if (fim < 0) continue;
    const cru = Buffer.from(bin.slice(inicio, fim), "latin1");
    let conteudo: string;
    try {
      conteudo = inflateSync(cru).toString("latin1");
    } catch {
      // PDF sem compressão (vários emissores de DANFE) — o stream já é o texto.
      conteudo = cru.toString("latin1");
    }
    if (!/T[jJ]/.test(conteudo)) continue;
    // Só os literais que são MOSTRADOS por Tj/TJ. Pegar todo "(...)" do stream
    // parecia equivalente, mas os bytes crus de uma imagem JPEG contêm "Tj" e
    // parênteses por acaso — num PDF com foto, o texto vinha afogado em lixo.
    for (const op of conteudo.matchAll(/(\[(?:[^[\]\\]|\\.)*\]|\((?:[^()\\]|\\.)*\))\s*(?:TJ|Tj)/g)) {
      for (const lit of op[1].matchAll(/\((?:[^()\\]|\\.)*\)/g)) {
        partes.push(
          lit[0]
            .slice(1, -1)
            .replace(/\\([()\\])/g, "$1")
            // Acentos saem em octal (\347 = ç) nos geradores que não usam UTF.
            .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))),
        );
      }
    }
    // Quebra por stream: cada página vira uma linha, o que separa um item do
    // seguinte quando o gerador não põe espaço nenhum.
    partes.push("\n");
  }
  return partes.join("");
}

/**
 * Chaves de NF-e encontradas num texto. Uma sequência longa de dígitos pode
 * conter várias janelas de 44 — é o dígito verificador que diz qual é a chave
 * de verdade (sem ele, "SÉRIE: 4" grudado na chave já produz uma janela
 * plausível e errada).
 */
export function chavesNfeNoTexto(texto: string): string[] {
  const achadas = new Set<string>();
  for (const corrida of texto.matchAll(/[\d .]{44,}/g)) {
    const digitos = corrida[0].replace(/\D/g, "");
    for (let i = 0; i + 44 <= digitos.length; i++) {
      const candidata = digitos.slice(i, i + 44);
      if (chaveNfeDvOk(candidata)) achadas.add(candidata);
    }
  }
  return [...achadas];
}

/** Primeira data dd/mm/aaaa do texto, em aaaa-mm-dd (a emissão vem no topo). */
export function primeiraDataDoTexto(texto: string): string | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
