import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Visitas ao anúncio público (vitrine).
 *
 * O que conta como visita: a abertura da página do anúncio por um VISITANTE —
 * quem está logado no sistema (a própria equipe conferindo o anúncio) não é
 * contado, senão o número diria mais sobre a loja do que sobre o interesse do
 * público.
 *
 * Quem é o visitante: um identificador anônimo sorteado e guardado num cookie
 * do navegador dele. Não é IP nem nada que identifique a pessoa; serve só para
 * (1) não contar dez vezes quem recarregou a página e (2) saber quantas pessoas
 * DIFERENTES abriram o anúncio.
 */

const COOKIE_VISITANTE = "mvp_visitante";
const UM_ANO = 60 * 60 * 24 * 365;
/** Recarregar a página dentro desta janela não conta de novo. */
const JANELA_MINUTOS = 30;

export type ResumoVisitas = { total: number; ultimos7: number; pessoas: number };

export const VISITAS_ZERADAS: ResumoVisitas = { total: 0, ultimos7: 0, pessoas: 0 };

/** Identificador anônimo do visitante; cria e grava no cookie na primeira vez. */
async function idDoVisitante(): Promise<string> {
  const store = await cookies();
  const atual = store.get(COOKIE_VISITANTE)?.value;
  if (atual && /^[a-f0-9]{32}$/.test(atual)) return atual;
  const novo = randomBytes(16).toString("hex");
  store.set(COOKIE_VISITANTE, novo, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: UM_ANO,
    path: "/",
  });
  return novo;
}

/**
 * Registra a abertura do anúncio. `alvo` é o id da página — o próprio servidor
 * descobre se é veículo ou avaliação (e ignora o que não estiver no ar), para
 * ninguém inflar o contador mandando ids à toa.
 */
export async function registrarVisita(alvo: string): Promise<void> {
  const id = String(alvo || "").trim();
  if (!id) return;

  const [veiculo, avaliacao] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { id, published: true, status: "ESTOQUE" },
      select: { id: true },
    }),
    prisma.vehicleAppraisal.findFirst({ where: { id, published: true }, select: { id: true } }),
  ]);
  if (!veiculo && !avaliacao) return;

  const visitor = await idDoVisitante();
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60 * 1000);
  const alvoWhere = veiculo ? { vehicleId: veiculo.id } : { appraisalId: avaliacao!.id };

  const recente = await prisma.showroomVisit.findFirst({
    where: { ...alvoWhere, visitor, viewedAt: { gte: desde } },
    select: { id: true },
  });
  if (recente) return;

  await prisma.showroomVisit.create({ data: { ...alvoWhere, visitor } });
}

function seteDiasAtras(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/** Resumo de um anúncio: total, últimos 7 dias e pessoas diferentes. */
export async function resumoDeVisitas(
  alvo: { vehicleId: string } | { appraisalId: string },
): Promise<ResumoVisitas> {
  const [total, ultimos7, distintos] = await Promise.all([
    prisma.showroomVisit.count({ where: alvo }),
    prisma.showroomVisit.count({ where: { ...alvo, viewedAt: { gte: seteDiasAtras() } } }),
    prisma.showroomVisit.findMany({
      where: alvo,
      select: { visitor: true },
      distinct: ["visitor"],
    }),
  ]);
  return { total, ultimos7, pessoas: distintos.length };
}

/**
 * Visitas de vários veículos de uma vez (listagem do estoque): duas consultas
 * agregadas, em vez de uma por linha.
 */
export async function visitasPorVeiculo(
  ids: string[],
): Promise<Map<string, { total: number; ultimos7: number }>> {
  const mapa = new Map<string, { total: number; ultimos7: number }>();
  if (ids.length === 0) return mapa;

  const [totais, recentes] = await Promise.all([
    prisma.showroomVisit.groupBy({
      by: ["vehicleId"],
      where: { vehicleId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.showroomVisit.groupBy({
      by: ["vehicleId"],
      where: { vehicleId: { in: ids }, viewedAt: { gte: seteDiasAtras() } },
      _count: { _all: true },
    }),
  ]);

  for (const t of totais) {
    if (!t.vehicleId) continue;
    mapa.set(t.vehicleId, { total: t._count._all, ultimos7: 0 });
  }
  for (const r of recentes) {
    if (!r.vehicleId) continue;
    const atual = mapa.get(r.vehicleId) ?? { total: 0, ultimos7: 0 };
    mapa.set(r.vehicleId, { ...atual, ultimos7: r._count._all });
  }
  return mapa;
}
