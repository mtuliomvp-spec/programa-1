import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Proteção contra força bruta nas portas públicas (login, código de
 * liberação, esqueci a senha). Conta falhas por chave (e-mail ou IP) numa
 * janela deslizante e bloqueia temporariamente quando passa do limite.
 * O estado fica no banco porque em produção cada requisição pode cair numa
 * instância serverless diferente — contador em memória não seguraria nada.
 */

export type ThrottlePolicy = { max: number; windowMs: number; lockMs: number };

const MIN = 60_000;

/** Senha errada no login, por e-mail: 5 falhas em 15 min → trava 10 min. */
export const LOGIN_EMAIL_POLICY: ThrottlePolicy = { max: 5, windowMs: 15 * MIN, lockMs: 10 * MIN };
/** Falhas de login por IP (varredura de vários e-mails): 20 em 15 min → 30 min. */
export const LOGIN_IP_POLICY: ThrottlePolicy = { max: 20, windowMs: 15 * MIN, lockMs: 30 * MIN };
/** Chutes de código de liberação no cadastro, por IP: 10 em 15 min → 30 min. */
export const ACCESS_CODE_POLICY: ThrottlePolicy = { max: 10, windowMs: 15 * MIN, lockMs: 30 * MIN };
/** Pedidos de "esqueci a senha" por e-mail: 3 em 15 min → 15 min sem enviar. */
export const FORGOT_POLICY: ThrottlePolicy = { max: 3, windowMs: 15 * MIN, lockMs: 15 * MIN };

/** IP de quem fez a requisição (atrás do proxy da Vercel). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim();
  return ip || "desconhecido";
}

/** Minutos (arredondados para cima) até destravar — para a mensagem ao usuário. */
export function minutesLeft(until: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - Date.now()) / MIN));
}

/** Se a chave está bloqueada agora, devolve até quando; senão, null. */
export async function lockedUntil(key: string): Promise<Date | null> {
  const row = await prisma.loginThrottle.findUnique({ where: { key } });
  return row?.lockedUntil && row.lockedUntil > new Date() ? row.lockedUntil : null;
}

/**
 * Registra uma falha na chave. Devolve o fim do bloqueio quando esta falha
 * estourou o limite; null enquanto ainda há tentativas na janela.
 */
export async function registerFailure(key: string, policy: ThrottlePolicy): Promise<Date | null> {
  const now = new Date();
  const row = await prisma.loginThrottle.findUnique({ where: { key } });
  if (!row) {
    // Aproveita para limpar chaves paradas há mais de 24h (a tabela não cresce à toa).
    await prisma.loginThrottle.deleteMany({
      where: { updatedAt: { lt: new Date(now.getTime() - 24 * 60 * MIN) } },
    });
    // Corrida entre duas falhas simultâneas: a segunda cai no unique e é só contagem.
    await prisma.loginThrottle
      .create({ data: { key, attempts: 1, firstAt: now } })
      .catch(() => {});
    return null;
  }
  const inWindow = now.getTime() - row.firstAt.getTime() <= policy.windowMs;
  const attempts = inWindow ? row.attempts + 1 : 1;
  if (attempts >= policy.max) {
    const until = new Date(now.getTime() + policy.lockMs);
    await prisma.loginThrottle.update({
      where: { key },
      data: { attempts: 0, firstAt: now, lockedUntil: until },
    });
    return until;
  }
  await prisma.loginThrottle.update({
    where: { key },
    data: { attempts, firstAt: inWindow ? row.firstAt : now },
  });
  return null;
}

/** Zera a chave (login bem-sucedido). */
export async function clearThrottle(key: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key } });
}
