import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import { getAuthSecret } from "@/lib/auth";
import { ehPainelDaPlataforma } from "@/lib/tenant";

/**
 * Painel da plataforma (Fincore360): cadastro das lojas assinantes.
 *
 * Só existe em `admin.<DOMINIO_PLATAFORMA>` e com o multi-loja ligado; em
 * qualquer outro endereço a rota responde 404. Entrada pela senha da
 * plataforma (PLATAFORMA_SENHA, ou a SUPER_ADMIN_PASSWORD na falta dela) —
 * não há usuário: quem opera é o dono do sistema.
 */

const PORTAO = "fincore_plataforma";
const HORAS = 4;

export function senhaDaPlataforma(): string | null {
  return process.env.PLATAFORMA_SENHA?.trim() || process.env.SUPER_ADMIN_PASSWORD?.trim() || null;
}

function assinar(corpo: string): string {
  return createHmac("sha256", `${getAuthSecret()}:plataforma`).update(corpo).digest("base64url");
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function senhaConfere(digitada: string): boolean {
  const senha = senhaDaPlataforma();
  // Compara os HMACs (mesmo tamanho), não as senhas: não vaza o comprimento.
  return !!senha && iguais(assinar(`senha:${digitada}`), assinar(`senha:${senha}`));
}

/** Cookie do portão aberto (gravado pela rota /plataforma/entrar). */
export function cookieDoPortao(): { nome: string; valor: string; opcoes: Record<string, unknown> } {
  const corpo = Buffer.from(JSON.stringify({ exp: Date.now() + HORAS * 3600_000 })).toString("base64url");
  return {
    nome: PORTAO,
    valor: `${corpo}.${assinar(corpo)}`,
    opcoes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: HORAS * 3600,
      path: "/plataforma",
    },
  };
}

export const NOME_DO_PORTAO = PORTAO;

async function portaoAberto(): Promise<boolean> {
  const token = (await cookies()).get(PORTAO)?.value;
  if (!token) return false;
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura || !iguais(assinatura, assinar(corpo))) return false;
  try {
    return (JSON.parse(Buffer.from(corpo, "base64url").toString()) as { exp: number }).exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * Para as PÁGINAS: 404 fora do endereço do painel (ou sem senha configurada);
 * devolve se o portão está aberto (senão a página mostra a senha).
 */
export async function acessoAoPainel(): Promise<boolean> {
  if (!senhaDaPlataforma() || !(await ehPainelDaPlataforma())) notFound();
  return portaoAberto();
}

/** Para as AÇÕES: recusa fora do painel ou com o portão fechado. */
export async function exigirPainel(): Promise<void> {
  if (!senhaDaPlataforma() || !(await ehPainelDaPlataforma()) || !(await portaoAberto())) {
    throw new Error("Acesso restrito ao painel da plataforma.");
  }
}

// ---------------------------------------------------------------------------
// Banco da loja nova
// ---------------------------------------------------------------------------

/**
 * Servidor Postgres onde nascem os bancos das lojas novas:
 * PLATAFORMA_BANCO_URL (com pooler, usada pelo sistema) e
 * PLATAFORMA_BANCO_URL_DIRETA (sem pooler, usada para criar o banco e nas
 * migrações). No Neon são as duas URLs do mesmo projeto; o usuário dono do
 * projeto pode criar bancos. O nome do banco na URL é trocado pelo da loja.
 */
export function servidorDeBancos(): { url: string; direta: string } | null {
  const url = process.env.PLATAFORMA_BANCO_URL?.trim();
  if (!url) return null;
  return { url, direta: process.env.PLATAFORMA_BANCO_URL_DIRETA?.trim() || url };
}

function comBanco(url: string, banco: string): string {
  const u = new URL(url);
  u.pathname = `/${banco}`;
  return u.toString();
}

export function nomeDoBanco(slug: string): string {
  return `loja_${slug.replace(/-/g, "_")}`;
}

/** Cria o banco vazio da loja e devolve as duas URLs dele. */
export async function criarBancoDaLoja(slug: string): Promise<{ databaseUrl: string; databaseUrlDireta: string }> {
  const servidor = servidorDeBancos();
  if (!servidor) throw new Error("Servidor de bancos não configurado (PLATAFORMA_BANCO_URL).");
  const banco = nomeDoBanco(slug);
  if (!/^loja_[a-z0-9_]{3,40}$/.test(banco)) throw new Error("Nome de banco inválido.");
  const admin = new PrismaClient({ datasourceUrl: servidor.direta });
  try {
    const existe = await admin.$queryRaw<{ n: number }[]>`SELECT 1 AS n FROM pg_database WHERE datname = ${banco}`;
    if (existe.length) throw new Error(`Já existe um banco "${banco}" no servidor. Escolha outro subdomínio.`);
    // Identificador validado acima (só minúsculas, números e _).
    await admin.$executeRawUnsafe(`CREATE DATABASE "${banco}"`);
  } finally {
    await admin.$disconnect();
  }
  return { databaseUrl: comBanco(servidor.url, banco), databaseUrlDireta: comBanco(servidor.direta, banco) };
}

/**
 * Pede uma nova publicação à Vercel (Deploy Hook, VERCEL_DEPLOY_HOOK_URL): é
 * ela que aplica as migrações no banco novo e cria o administrador.
 */
export async function dispararPublicacao(): Promise<"disparada" | "sem-gancho" | "falhou"> {
  const gancho = process.env.VERCEL_DEPLOY_HOOK_URL?.trim();
  if (!gancho) return "sem-gancho";
  try {
    const r = await fetch(gancho, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000) });
    return r.ok ? "disparada" : "falhou";
  } catch {
    return "falhou";
  }
}

/** Segredos que a loja contrata e cadastra no painel (nunca exibidos de volta). */
export const SEGREDOS_DA_LOJA = [
  { chave: "RENAVE_CERT_PFX_BASE64", rotulo: "Certificado e-CNPJ A1 (.pfx) — Renave produção", arquivo: true },
  { chave: "RENAVE_CERT_SENHA", rotulo: "Senha do certificado — produção", senha: true },
  { chave: "RENAVE_CERT_HOMOLOGACAO_PFX_BASE64", rotulo: "Certificado (.pfx) — Renave homologação", arquivo: true },
  { chave: "RENAVE_CERT_HOMOLOGACAO_SENHA", rotulo: "Senha do certificado — homologação", senha: true },
  { chave: "FOCUS_NFE_TOKEN_PRODUCAO", rotulo: "Token Focus NFe — produção", senha: true },
  { chave: "FOCUS_NFE_TOKEN_HOMOLOGACAO", rotulo: "Token Focus NFe — homologação", senha: true },
  { chave: "PLACA_API_TOKEN", rotulo: "Token da consulta por placa (wdapi2)", senha: true },
  { chave: "APP_URL", rotulo: "Endereço público da loja (links dos e-mails)", senha: false },
] as const;
