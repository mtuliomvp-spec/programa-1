import "server-only";
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Usuário autenticado da requisição atual (valida no banco: precisa existir e estar ativo). */
export async function getSessionUser() {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) return null;
  return user;
}
