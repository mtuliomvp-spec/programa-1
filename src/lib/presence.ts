import "server-only";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Quem está no sistema agora e quem já entrou — para o painel do Super Admin.
 *
 * A sessão desta instalação é um cookie assinado (não há sessão guardada no
 * banco), então "online" aqui é o que o servidor viu por último: o cliente
 * logado consulta `/api/system-lock` a cada 10 s e esse batimento carimba
 * `lastSeenAt`. Quem fecha a aba para de bater e some da lista em poucos
 * minutos; quem clica em "Sair" some na hora (o campo é zerado).
 */

/** Janela de tolerância do "online": ~12 batimentos perdidos. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/** Gravação no máximo 1×/min por usuário — o batimento é a cada 10 s. */
const HEARTBEAT_THROTTLE_MS = 60 * 1000;

/**
 * Marca a atividade do usuário. Uma única escrita condicional: quando o
 * carimbo é recente, o `updateMany` não acha linha e não escreve nada.
 */
export async function touchPresence(userId: string): Promise<void> {
  const agora = new Date();
  const limite = new Date(agora.getTime() - HEARTBEAT_THROTTLE_MS);
  try {
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: limite } }] },
      data: { lastSeenAt: agora },
    });
  } catch {
    // Presença é acessório: nunca derruba a resposta que a estava carregando.
  }
}

/** Tira a pessoa da lista de online na hora (chamado ao sair). */
export async function clearPresence(userId: string): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: null } });
  } catch {
    // idem
  }
}

/** "Mozilla/5.0 (iPhone…) …Safari" → "Celular · Safari". */
export function describeDevice(userAgent: string | null | undefined): string | null {
  const ua = (userAgent || "").trim();
  if (!ua) return null;
  const aparelho = /iPad|Tablet/i.test(ua)
    ? "Tablet"
    : /Mobi|Android|iPhone/i.test(ua)
      ? "Celular"
      : "Computador";
  // Ordem importa: Edge e Opera também se dizem Chrome; Chrome também diz Safari.
  const navegador = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : null;
  return navegador ? `${aparelho} · ${navegador}` : aparelho;
}

/** Primeiro IP do X-Forwarded-For (o do cliente), quando houver. */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const fwd = headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : headers.get("x-real-ip") || "").trim();
  return ip || null;
}

/**
 * Registra um acesso concluído. Chamado de um lugar só — de onde a sessão
 * nasce (`setSessionCookie`) —, para que login, primeiro acesso e troca de
 * senha caiam todos no histórico sem depender de cada tela lembrar disso.
 */
export async function recordLogin(input: {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  ip?: string | null;
  device?: string | null;
}): Promise<void> {
  try {
    await prisma.$transaction([
      prisma.loginEvent.create({
        data: {
          userId: input.userId,
          name: input.name,
          email: input.email,
          role: input.role,
          ip: input.ip || null,
          device: input.device || null,
        },
      }),
      // Já entra na lista de online sem esperar o primeiro batimento.
      prisma.user.update({ where: { id: input.userId }, data: { lastSeenAt: new Date() } }),
    ]);
  } catch {
    // O acesso não pode falhar porque o histórico falhou.
  }
}

export type PresenceUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  profileName: string | null;
  lastSeenAt: Date;
};

/** Quem bateu ponto na janela de tolerância, do mais recente para o mais antigo. */
export async function listOnlineUsers(): Promise<PresenceUser[]> {
  const desde = new Date(Date.now() - ONLINE_WINDOW_MS);
  const users = await prisma.user.findMany({
    where: { active: true, lastSeenAt: { gte: desde } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastSeenAt: true,
      profile: { select: { name: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    profileName: u.profile?.name ?? null,
    lastSeenAt: u.lastSeenAt as Date,
  }));
}

export type LoginRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  at: Date;
  ip: string | null;
  device: string | null;
  online: boolean;
};

/** Histórico de acessos, do mais recente para o mais antigo. */
export async function listRecentLogins(limit = 20): Promise<LoginRow[]> {
  const desde = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [eventos, online] = await Promise.all([
    prisma.loginEvent.findMany({ orderBy: { at: "desc" }, take: limit }),
    prisma.user.findMany({
      where: { active: true, lastSeenAt: { gte: desde } },
      select: { id: true },
    }),
  ]);
  const onlineIds = new Set(online.map((u) => u.id));
  return eventos.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    role: e.role,
    at: e.at,
    ip: e.ip,
    device: e.device,
    online: Boolean(e.userId && onlineIds.has(e.userId)),
  }));
}

/** Resumo do histórico: acessos e pessoas distintas nos últimos 7 e 30 dias. */
export async function loginSummary(): Promise<{
  total: number;
  semana: number;
  pessoasSemana: number;
  mes: number;
  primeiro: Date | null;
}> {
  const agora = Date.now();
  const semanaAtras = new Date(agora - 7 * 24 * 60 * 60 * 1000);
  const mesAtras = new Date(agora - 30 * 24 * 60 * 60 * 1000);
  const [total, semana, mes, distintos, primeiro] = await Promise.all([
    prisma.loginEvent.count(),
    prisma.loginEvent.count({ where: { at: { gte: semanaAtras } } }),
    prisma.loginEvent.count({ where: { at: { gte: mesAtras } } }),
    prisma.loginEvent.findMany({
      where: { at: { gte: semanaAtras } },
      distinct: ["email"],
      select: { email: true },
    }),
    prisma.loginEvent.findFirst({ orderBy: { at: "asc" }, select: { at: true } }),
  ]);
  return { total, semana, pessoasSemana: distintos.length, mes, primeiro: primeiro?.at ?? null };
}
