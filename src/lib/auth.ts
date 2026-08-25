import "server-only";
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Autenticação própria, sem serviços externos:
 * - senha com scrypt (salt individual)
 * - sessão em cookie httpOnly assinado com HMAC-SHA256
 *
 * O segredo vem de AUTH_SECRET; sem ela, deriva do DATABASE_URL para
 * funcionar sem configuração extra (defina AUTH_SECRET em produção se
 * quiser poder trocar o banco sem derrubar as sessões).
 */

export const SESSION_COOKIE = "mvp_session";
const SESSION_DAYS = 30;

export function getAuthSecret(): string {
  const base = process.env.AUTH_SECRET || process.env.DATABASE_URL || "mvp-veiculos-dev";
  return createHash("sha256").update(base).digest("hex");
}

// ---------------------------------------------------------------------------
// Senhas
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---------------------------------------------------------------------------
// Sessão (token assinado)
// ---------------------------------------------------------------------------

export type SessionPayload = {
  sub: string;
  name: string;
  role: UserRole;
  exp: number;
};

function sign(data: string): string {
  return createHmac("sha256", getAuthSecret()).update(data).digest("base64url");
}

export function createSessionToken(user: { id: string; name: string; role: UserRole }): string {
  const payload: SessionPayload = {
    sub: user.id,
    name: user.name,
    role: user.role,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.sub || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers de sessão no servidor
// ---------------------------------------------------------------------------

export async function setSessionCookie(user: { id: string; name: string; role: UserRole }) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
  // Histórico de acessos do painel do Super Admin. Fica aqui, e não em cada
  // tela de entrada, porque é aqui que a sessão nasce — login, primeiro acesso
  // e troca de senha caem todos no registro sem depender de quem chamou.
  await registrarAcesso(user);
}

/** Grava o acesso e o e-mail/aparelho de quem entrou (nunca derruba o login). */
async function registrarAcesso(user: { id: string; name: string; role: UserRole }) {
  try {
    const [{ recordLogin, describeDevice, clientIp }, { headers }, dono] = await Promise.all([
      import("@/lib/presence"),
      import("next/headers"),
      prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }),
    ]);
    const h = await headers();
    await recordLogin({
      userId: user.id,
      name: user.name,
      email: dono?.email ?? "",
      role: user.role,
      ip: clientIp(h),
      device: describeDevice(h.get("user-agent")),
    });
  } catch {
    // Registro é acessório: entrar no sistema não pode falhar por causa dele.
  }
}

export async function clearSessionCookie() {
  const store = await cookies();
  // Lê ANTES de apagar: depois do delete não há mais de quem tirar a presença.
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  // Sair tira a pessoa da lista de "online" na hora, sem esperar a janela.
  if (payload) {
    try {
      const { clearPresence } = await import("@/lib/presence");
      await clearPresence(payload.sub);
    } catch {
      // Presença é acessório: sair do sistema nunca pode falhar por isso.
    }
  }
}

/**
 * Usuário autenticado da requisição atual (valida no banco: precisa existir e
 * estar ativo).
 *
 * Memoizado por REQUISIÇÃO (`cache` do React): o layout, o guard da área, cada
 * `userCan` e cada `<Can>` chamavam isto separadamente — eram 7 a 15 consultas
 * idênticas do mesmo usuário a cada troca de tela. Agora é uma só.
 */
export const getSessionUser = cache(async () => {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      permissions: true,
      profile: { select: { name: true } },
    },
  });
  if (!user || !user.active) return null;
  return user;
});
