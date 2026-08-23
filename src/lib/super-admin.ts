import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAuthSecret, getSessionUser } from "@/lib/auth";

/**
 * Super Admin — o dono do sistema (operadora do SaaS).
 *
 * É um perfil INVISÍVEL para a loja: não aparece na tela de Usuários, não pode
 * ser editado nem excluído pelo administrador do cliente, e a senha mestra do
 * administrador não abre a conta dele. Concentra o que é do fornecedor:
 * bloquear o sistema (inclusive por falta de pagamento), assinatura, uso da
 * plataforma, uso de IA, backup/zerar e diagnósticos.
 *
 * O administrador do cliente segue dono da própria casa: usuários, perfis de
 * acesso e parâmetros da empresa continuam com ele.
 */

export type SessionUserLike = { role: string } | null | undefined;

export function isSuperAdmin(user: SessionUserLike): boolean {
  return user?.role === "SUPER_ADMIN";
}

/** Recusa quem não for Super Admin (defesa no servidor). */
export async function assertSuperAdmin() {
  const user = await getSessionUser();
  if (!isSuperAdmin(user)) throw new Error("Acesso restrito ao Super Admin.");
  return user!;
}

/** Versão silenciosa, para páginas: devolve o usuário ou null. */
export async function currentSuperAdmin() {
  const user = await getSessionUser();
  return isSuperAdmin(user) ? user : null;
}

// ---------------------------------------------------------------------------
// Portão da tela oculta (/super)
// ---------------------------------------------------------------------------

export const SUPER_GATE_COOKIE = "mvp_super_gate";
const GATE_HOURS = 4;

/**
 * Senha mestra da tela oculta, definida por variável de ambiente da
 * instalação. Sem ela a rota nem existe (devolve 404) — é o que impede o
 * cliente de descobrir a tela mexendo no sistema.
 */
export function superPassword(): string | null {
  return process.env.SUPER_ADMIN_PASSWORD?.trim() || null;
}

function sign(payload: string): string {
  return createHmac("sha256", `${getAuthSecret()}:super`).update(payload).digest("base64url");
}

function makeToken(): string {
  const body = Buffer.from(
    JSON.stringify({ exp: Date.now() + GATE_HOURS * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function tokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, "base64url").toString()) as { exp: number };
    return exp > Date.now();
  } catch {
    return false;
  }
}

export async function setSuperGateCookie() {
  const store = await cookies();
  store.set(SUPER_GATE_COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_HOURS * 60 * 60,
  });
}

export async function clearSuperGateCookie() {
  const store = await cookies();
  store.delete(SUPER_GATE_COOKIE);
}

/**
 * Pode operar a tela oculta? Duas portas: já estar logado como Super Admin, ou
 * ter passado a senha mestra nesta sessão (cookie assinado, 4h).
 */
export async function superGateOpen(): Promise<boolean> {
  if (await currentSuperAdmin()) return true;
  const store = await cookies();
  return tokenValid(store.get(SUPER_GATE_COOKIE)?.value);
}

/** Recusa quem não passou pelo portão (usado nas ações da tela oculta). */
export async function assertSuperGate() {
  if (!(await superGateOpen())) throw new Error("Acesso restrito.");
}

/** Já existe algum Super Admin nesta instalação? */
export async function hasAnySuperAdmin(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: "SUPER_ADMIN" } })) > 0;
}

/**
 * Porta de PRIMEIRO CADASTRO, aberta pelo próprio sistema.
 *
 * Enquanto a instalação não tem nenhum Super Admin, o administrador logado
 * pode criar o primeiro — é assim que o fornecedor monta a instalação sem
 * depender de variável de ambiente. Criado o primeiro, a porta se FECHA para
 * sempre: daí em diante só entra quem já é Super Admin ou quem tem a senha
 * mestra, e nenhum administrador do cliente consegue se promover.
 */
export async function bootstrapAllowed(): Promise<boolean> {
  if (await hasAnySuperAdmin()) return false;
  const user = await getSessionUser();
  return user?.role === "ADMIN";
}

/**
 * Usuários que podem ser promovidos a Super Admin — os que já existem e ainda
 * não são. Aguardando aprovação ficam de fora: promover um cadastro que nem
 * foi liberado seria pular a conferência de quem é a pessoa.
 */
export async function listPromotableUsers() {
  return prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, pending: false },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true },
  });
}

/** Todos os Super Admins cadastrados (só a própria tela oculta enxerga). */
export async function listSuperAdmins() {
  return prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, active: true, createdAt: true },
  });
}
