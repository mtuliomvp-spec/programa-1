"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthSecret, getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { MODELOS_BACKUP, DEMO_PRESERVADAS, DOMINIO_IMPORTADO, modeloBackup } from "@/lib/backup/esquema";
import { disfarceDoBackup } from "@/lib/backup/dicionario";
import { APP_BACKUP, FORMATO_BACKUP, type ModoBackup } from "@/lib/backup/formato";

/**
 * Backup e restauração EM LOTES.
 *
 * A Vercel não deixa uma requisição (nem a resposta) passar de ~4,5 MB, e o
 * backup antigo era um arquivo único com todos os PDFs dentro — não descia nem
 * subia. Agora o navegador conversa com o servidor tabela por tabela, em
 * pedaços pequenos, e monta (ou lê) o arquivo do lado dele.
 *
 * Dois tipos de backup:
 *  - COMPLETO: tudo, como está, com os documentos. É o da produção.
 *  - DEMONSTRAÇÃO: nomes, documentos, contatos, placas e arquivos disfarçados
 *    ainda na produção — o dado real não sai de lá. Só a instalação de
 *    demonstração aceita este, e ela só aceita este.
 */

const LIMITE_LOTE = 2_500_000;

async function exigirSuperAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") throw new Error("Apenas o Super Admin faz backup e restauração.");
  return user;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (nome: string) => (prisma as any)[nome];

export type PlanoBackup = {
  ok: boolean;
  erro?: string;
  modelos?: { nome: string; total: number }[];
};

/** Quais tabelas vão no arquivo, na ordem de gravação, e quantas linhas cada uma. */
export async function planoBackupAction(modo: ModoBackup): Promise<PlanoBackup> {
  try {
    await exigirSuperAdmin();
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  const modelos = MODELOS_BACKUP.filter((m) => modo === "completo" || m.nome === "User" || !DEMO_PRESERVADAS.has(m.nome));
  const totais = await Promise.all(modelos.map((m) => delegate(m.delegate).count() as Promise<number>));
  return { ok: true, modelos: modelos.map((m, i) => ({ nome: m.nome, total: totais[i] })) };
}

export type LoteBackup = {
  ok: boolean;
  erro?: string;
  linhas?: Record<string, unknown>[];
  /** Último id do lote; null = a tabela acabou. */
  proximo?: string | null;
};

/**
 * Um pedaço de uma tabela. Os arquivos (Bytes) não vêm aqui: no completo, cada
 * um desce depois pela rota /sistema/backup/arquivo (marcado com `$arq`); no
 * disfarçado, já vem o PDF de demonstração no lugar (`$b64`).
 */
export async function loteBackupAction(input: {
  modelo: string;
  depoisDe: string | null;
  modo: ModoBackup;
  sal: string;
}): Promise<LoteBackup> {
  try {
    await exigirSuperAdmin();
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  const m = modeloBackup(input.modelo);
  if (!m) return { ok: false, erro: `Tabela desconhecida: ${input.modelo}` };
  if (input.modo === "demonstracao" && m.nome !== "User" && DEMO_PRESERVADAS.has(m.nome)) {
    return { ok: true, linhas: [], proximo: null };
  }

  const omit = Object.fromEntries(m.bytes.map((b) => [b, true]));
  // Tabela que aponta para ela mesma (sócio dentro de sócio) desce inteira, já
  // com os "pais" antes, para a restauração gravar na ordem certa.
  const inteira = m.autoRef.length > 0;
  let linhas: Record<string, unknown>[] = await delegate(m.delegate).findMany({
    ...(input.depoisDe && !inteira ? { where: { id: { gt: input.depoisDe } } } : {}),
    orderBy: { id: "asc" },
    ...(inteira ? {} : { take: m.json.length ? 100 : 300 }),
    ...(m.bytes.length ? { omit } : {}),
  });
  if (inteira) linhas = paisPrimeiro(linhas, m.autoRef);

  // Tamanho de cada arquivo (sem carregar o arquivo).
  if (m.bytes.length && linhas.length) {
    const cols = m.bytes.map((b) => {
      const c = m.campos.find((x) => x.nome === b)!;
      return `octet_length("${c.coluna}") AS "${b}"`;
    });
    const tamanhos: Record<string, number | null>[] = await prisma.$queryRawUnsafe(
      `SELECT id, ${cols.join(", ")} FROM "${m.tabela}" WHERE id = ANY($1::text[])`,
      linhas.map((l) => l.id as string),
    );
    const porId = new Map(tamanhos.map((t) => [t.id as unknown as string, t]));
    for (const l of linhas) {
      const t = porId.get(l.id as string);
      for (const b of m.bytes) {
        const tam = t?.[b];
        l[b] = tam == null ? null : { $arq: Number(tam) };
      }
    }
  }

  if (input.modo === "demonstracao") {
    const disfarce = await disfarceDoBackup(input.sal);
    linhas = linhas.map((l) => {
      const o = disfarce.linha(m.nome, l, m.campos);
      for (const b of m.bytes) {
        if (o[b] == null) continue;
        const mimeCampo = m.campos.some((c) => c.nome === "mimeType") ? "mimeType" : m.campos.some((c) => c.nome === "receiptMime") ? "receiptMime" : null;
        const nomeCampo = m.campos.some((c) => c.nome === "filename") ? "filename" : m.campos.some((c) => c.nome === "receiptName") ? "receiptName" : null;
        const arq = disfarce.arquivo(mimeCampo ? (l[mimeCampo] as string) : null);
        o[b] = { $b64: arq.data.toString("base64") };
        if (mimeCampo) o[mimeCampo] = arq.mime;
        if (nomeCampo) o[nomeCampo] = arq.nome;
        if (m.campos.some((c) => c.nome === "size")) o.size = arq.data.byteLength;
      }
      return o;
    });
  }

  // Lote grande demais para a resposta: corta e o resto vem no próximo.
  let tamanho = 0;
  let corte = linhas.length;
  for (let i = 0; i < linhas.length; i++) {
    tamanho += JSON.stringify(linhas[i]).length;
    if (!inteira && tamanho > LIMITE_LOTE && i > 0) {
      corte = i;
      break;
    }
  }
  const lote = linhas.slice(0, corte);
  const acabou = inteira || (corte === linhas.length && linhas.length < (m.json.length ? 100 : 300));
  return { ok: true, linhas: lote, proximo: acabou ? null : ((lote[lote.length - 1]?.id as string) ?? null) };
}

/** Ordena para que cada linha venha depois da linha "pai" dela. */
function paisPrimeiro(linhas: Record<string, unknown>[], refs: string[]) {
  const ids = new Set(linhas.map((l) => l.id as string));
  const feitos = new Set<string>();
  const saida: Record<string, unknown>[] = [];
  let resto = [...linhas];
  while (resto.length) {
    const prontos = resto.filter((l) =>
      refs.every((r) => !l[r] || !ids.has(l[r] as string) || feitos.has(l[r] as string) || l[r] === l.id),
    );
    const vez = prontos.length ? prontos : resto;
    for (const l of vez) {
      feitos.add(l.id as string);
      saida.push(l);
    }
    resto = resto.filter((l) => !feitos.has(l.id as string));
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Restauração
// ---------------------------------------------------------------------------

/**
 * A restauração vem em dezenas de requisições, e a do backup completo apaga os
 * usuários no primeiro passo — inclusive quem está restaurando. Por isso o
 * primeiro passo entrega um passe assinado, válido por 1 hora, que os passos
 * seguintes apresentam no lugar da sessão.
 */
function assinar(corpo: string) {
  return createHmac("sha256", getAuthSecret()).update(`restauracao|${corpo}`).digest("base64url");
}

function conferirPasse(passe: string): ModoBackup | null {
  const [corpo, assinatura] = (passe || "").split(".");
  if (!corpo || !assinatura) return null;
  const a = Buffer.from(assinatura);
  const b = Buffer.from(assinar(corpo));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const dados = JSON.parse(Buffer.from(corpo, "base64url").toString()) as { exp: number; modo: ModoBackup };
    if (dados.exp < Date.now()) return null;
    return dados.modo === (isDemoMode() ? "demonstracao" : "completo") ? dados.modo : null;
  } catch {
    return null;
  }
}

export type InicioRestauracao = { ok: boolean; erro?: string; passe?: string };

/**
 * Confere o arquivo e APAGA os dados atuais. Na produção só entra backup
 * completo; na demonstração, só o disfarçado — e lá os usuários, os
 * parâmetros e a assinatura da própria demonstração ficam como estão.
 */
export async function iniciarRestauracaoAction(meta: {
  app?: string;
  formato?: number;
  modo?: string;
}): Promise<InicioRestauracao> {
  try {
    await exigirSuperAdmin();
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
  if (meta?.app !== APP_BACKUP || meta.formato !== FORMATO_BACKUP) {
    return { ok: false, erro: "Este arquivo não é um backup deste sistema (ou é de um formato antigo)." };
  }
  const demo = isDemoMode();
  if (demo && meta.modo !== "demonstracao") {
    return {
      ok: false,
      erro: "Esta é a instalação de demonstração: ela só aceita o backup DISFARÇADO (\"Backup para demonstração\"). Dados reais não entram aqui.",
    };
  }
  if (!demo && meta.modo !== "completo") {
    return {
      ok: false,
      erro: "Este é um backup disfarçado, feito para a demonstração. Restaurá-lo aqui trocaria os dados reais por fictícios — recusado.",
    };
  }

  const apagar = MODELOS_BACKUP.filter((m) => !demo || !DEMO_PRESERVADAS.has(m.nome));
  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`TRUNCATE TABLE ${apagar.map((m) => `"${m.tabela}"`).join(", ")} RESTART IDENTITY`),
      // Usuários da loja trazidos por uma restauração anterior (desativados).
      ...(demo ? [prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMINIO_IMPORTADO}` } } })] : []),
    ]);
  } catch (e) {
    return { ok: false, erro: `Não consegui apagar os dados atuais: ${(e as Error).message.split("\n").pop()}` };
  }

  const corpo = Buffer.from(JSON.stringify({ exp: Date.now() + 60 * 60 * 1000, modo: demo ? "demonstracao" : "completo" })).toString("base64url");
  return { ok: true, passe: `${corpo}.${assinar(corpo)}` };
}

export type LoteRestauracao = { ok: boolean; erro?: string; gravadas?: number };

/**
 * Grava um lote de UMA tabela. Os arquivos vêm como partes binárias do
 * FormData (`$arq: "f3"` aponta para a parte f3), sem o inchaço do base64.
 */
export async function loteRestauracaoAction(fd: FormData): Promise<LoteRestauracao> {
  const modo = conferirPasse(String(fd.get("passe") || ""));
  if (!modo) return { ok: false, erro: "A restauração expirou ou não foi iniciada aqui. Comece de novo." };
  const m = modeloBackup(String(fd.get("modelo") || ""));
  // Tabela que não existe mais nesta versão: ignora.
  if (!m) return { ok: true, gravadas: 0 };
  if (modo === "demonstracao" && m.nome !== "User" && DEMO_PRESERVADAS.has(m.nome)) return { ok: true, gravadas: 0 };

  let linhas: Record<string, unknown>[];
  try {
    linhas = JSON.parse(String(fd.get("linhas") || "[]"));
  } catch {
    return { ok: false, erro: `Lote ilegível da tabela ${m.nome}.` };
  }

  const dados = [];
  for (const l of linhas) {
    const o: Record<string, unknown> = {};
    for (const c of m.campos) {
      if (!(c.nome in l)) continue; // campo novo nesta versão: fica o padrão do banco
      let v = l[c.nome];
      if (c.tipo === "Bytes") {
        const ref = (v as { $arq?: string } | null)?.$arq;
        const parte = ref ? fd.get(ref) : null;
        if (parte instanceof Blob) v = new Uint8Array(await parte.arrayBuffer());
        else if (v != null) return { ok: false, erro: `Arquivo faltando no lote da tabela ${m.nome}.` };
      } else if (c.tipo === "Json" && v === null) {
        v = Prisma.DbNull;
      }
      o[c.nome] = v;
    }
    if (modo === "demonstracao" && m.nome === "User") {
      // Mesmo que o arquivo tenha sido mexido: usuário da loja não entra na demonstração.
      o.active = false;
      o.pending = false;
      o.profileId = null;
      o.passwordHash = "!importado";
      if (o.role === "SUPER_ADMIN") o.role = "ADMIN";
      if (!String(o.email || "").endsWith(`@${DOMINIO_IMPORTADO}`)) {
        o.email = `usuario.${String(o.id).slice(-8)}@${DOMINIO_IMPORTADO}`;
      }
    }
    dados.push(o);
  }

  try {
    await delegate(m.delegate).createMany({ data: dados, skipDuplicates: modo === "demonstracao" && m.nome === "User" });
  } catch (e) {
    const msg = (e as Error).message.split("\n").filter(Boolean).pop() ?? "erro desconhecido";
    return { ok: false, erro: `Falhou ao gravar a tabela ${m.nome}: ${msg}` };
  }
  return { ok: true, gravadas: dados.length };
}

/** Último passo: realinha os contadores (nº da ordem, da venda…) ao maior restaurado. */
export async function finalizarRestauracaoAction(passe: string): Promise<{ ok: boolean; erro?: string }> {
  if (!conferirPasse(passe)) return { ok: false, erro: "A restauração expirou. Comece de novo." };
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE r record; v bigint;
      BEGIN
        FOR r IN
          SELECT c.table_name, c.column_name
          FROM information_schema.columns c
          WHERE c.table_schema = current_schema() AND c.column_default LIKE 'nextval(%'
        LOOP
          EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.column_name, r.table_name) INTO v;
          PERFORM setval(pg_get_serial_sequence(format('%I', r.table_name), r.column_name), GREATEST(v, 1), v > 0);
        END LOOP;
      END $$;
    `);
  } catch (e) {
    return { ok: false, erro: `Dados restaurados, mas os contadores não foram ajustados: ${(e as Error).message}` };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
