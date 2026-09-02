import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Visitas ao anúncio público (vitrine).
 *
 * O que conta como visita: um VISITANTE abrir a página do anúncio OU tocar em
 * "Tenho interesse" (WhatsApp) direto no card da vitrine — esse segundo caminho
 * não passa pela página do anúncio, e mesmo assim é interesse real no carro.
 * Quem está logado no sistema (a própria equipe conferindo o anúncio) não é
 * contado, senão o número diria mais sobre a loja do que sobre o interesse do
 * público.
 *
 * Contato: a visita em que o visitante tocou no WhatsApp. É a mesma linha da
 * visita, marcada — assim "3 visitas, 1 contato" quer dizer três pessoas/abertu-
 * ras e uma delas chamou a loja, sem contar a mesma pessoa duas vezes.
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

export type ResumoVisitas = { total: number; ultimos7: number; pessoas: number; contatos: number };

export const VISITAS_ZERADAS: ResumoVisitas = { total: 0, ultimos7: 0, pessoas: 0, contatos: 0 };

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
 * Registra a visita ao anúncio. `alvo` é o id da página — o próprio servidor
 * descobre se é veículo ou avaliação (e ignora o que não estiver no ar), para
 * ninguém inflar o contador mandando ids à toa.
 *
 * `contato = true` quando o visitante tocou no WhatsApp: se ele já tinha uma
 * visita recente (abriu o anúncio e depois chamou), essa visita é marcada como
 * contato em vez de virar uma segunda visita; se não tinha (tocou direto no
 * card da vitrine), nasce uma visita já marcada.
 */
export async function registrarVisita(alvo: string, contato = false): Promise<void> {
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
    select: { id: true, contact: true },
  });
  if (recente) {
    if (contato && !recente.contact) {
      await prisma.showroomVisit.update({ where: { id: recente.id }, data: { contact: true } });
    }
    return;
  }

  await prisma.showroomVisit.create({ data: { ...alvoWhere, visitor, contact: contato } });
}

function seteDiasAtras(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/** Resumo de um anúncio: total, últimos 7 dias, pessoas diferentes e contatos. */
export async function resumoDeVisitas(
  alvo: { vehicleId: string } | { appraisalId: string },
): Promise<ResumoVisitas> {
  const [total, ultimos7, distintos, contatos] = await Promise.all([
    prisma.showroomVisit.count({ where: alvo }),
    prisma.showroomVisit.count({ where: { ...alvo, viewedAt: { gte: seteDiasAtras() } } }),
    prisma.showroomVisit.findMany({
      where: alvo,
      select: { visitor: true },
      distinct: ["visitor"],
    }),
    prisma.showroomVisit.count({ where: { ...alvo, contact: true } }),
  ]);
  return { total, ultimos7, pessoas: distintos.length, contatos };
}

export type VisitasResumidas = { total: number; ultimos7: number; contatos: number };

/**
 * Visitas de vários veículos de uma vez (listagem do estoque): três consultas
 * agregadas, em vez de uma por linha.
 */
export async function visitasPorVeiculo(ids: string[]): Promise<Map<string, VisitasResumidas>> {
  const mapa = new Map<string, VisitasResumidas>();
  if (ids.length === 0) return mapa;

  const [totais, recentes, contatos] = await Promise.all([
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
    prisma.showroomVisit.groupBy({
      by: ["vehicleId"],
      where: { vehicleId: { in: ids }, contact: true },
      _count: { _all: true },
    }),
  ]);

  const pega = (id: string) => mapa.get(id) ?? { total: 0, ultimos7: 0, contatos: 0 };
  for (const t of totais) {
    if (t.vehicleId) mapa.set(t.vehicleId, { ...pega(t.vehicleId), total: t._count._all });
  }
  for (const r of recentes) {
    if (r.vehicleId) mapa.set(r.vehicleId, { ...pega(r.vehicleId), ultimos7: r._count._all });
  }
  for (const c of contatos) {
    if (c.vehicleId) mapa.set(c.vehicleId, { ...pega(c.vehicleId), contatos: c._count._all });
  }
  return mapa;
}
