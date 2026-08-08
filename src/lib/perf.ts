import "server-only";

/**
 * Medição de desempenho em memória.
 *
 * Existe porque o sistema não tinha NENHUMA instrumentação: não havia como
 * saber se a lentidão vem de "consultas demais" ou de "cada consulta demora
 * muito" (banco longe do servidor). Sem esse dado, otimizar é chute.
 *
 * O que ele mede:
 *  - `recordQuery`: cronômetro em toda consulta do Prisma (ver src/lib/prisma.ts).
 *  - `timed`: blocos nomeados (o farol, o carregamento de uma tela, uma baixa).
 *
 * Limites de propósito: tudo vive na memória do processo, com teto fixo de
 * entradas. Em serverless cada instância tem os seus números e eles somem
 * quando ela é reciclada — o que se lê na tela é uma amostra, não um total
 * histórico. Para o diagnóstico é o bastante, e não custa banco nem storage.
 */

/** Teto de chaves distintas (blinda contra vazamento de memória). */
const MAX_KEYS = 400;
/** Quantas consultas lentas guardar para inspeção. */
const MAX_SLOWEST = 50;

export type PerfStat = {
  key: string;
  count: number;
  totalMs: number;
  maxMs: number;
  avgMs: number;
};

export type SlowQuery = { key: string; ms: number; at: number };

type Bucket = { count: number; totalMs: number; maxMs: number };

const queries = new Map<string, Bucket>();
const blocks = new Map<string, Bucket>();
const slowest: SlowQuery[] = [];
let startedAt = Date.now();

function add(map: Map<string, Bucket>, key: string, ms: number) {
  const cur = map.get(key);
  if (cur) {
    cur.count += 1;
    cur.totalMs += ms;
    if (ms > cur.maxMs) cur.maxMs = ms;
    return;
  }
  // Teto atingido: para de criar chaves novas em vez de crescer sem limite.
  if (map.size >= MAX_KEYS) return;
  map.set(key, { count: 1, totalMs: ms, maxMs: ms });
}

/** Registra uma consulta ao banco. Chamado pela extensão do Prisma. */
export function recordQuery(model: string | undefined, operation: string, ms: number) {
  const key = `${model ?? "raw"}.${operation}`;
  add(queries, key, ms);
  // Anel das mais lentas: mantém ordenado e corta o excedente.
  if (slowest.length < MAX_SLOWEST || ms > (slowest[slowest.length - 1]?.ms ?? 0)) {
    slowest.push({ key, ms, at: Date.now() });
    slowest.sort((a, b) => b.ms - a.ms);
    if (slowest.length > MAX_SLOWEST) slowest.length = MAX_SLOWEST;
  }
}

/**
 * Mede um bloco nomeado (ex.: "farol", "tela:a-pagar", "baixa:pagar título").
 * Devolve o resultado da função intacto — inclusive quando ela lança.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    add(blocks, label, performance.now() - t0);
  }
}

function toStats(map: Map<string, Bucket>): PerfStat[] {
  return [...map.entries()]
    .map(([key, b]) => ({ key, count: b.count, totalMs: b.totalMs, maxMs: b.maxMs, avgMs: b.totalMs / b.count }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

export type PerfSnapshot = {
  /** Desde quando estes números vêm sendo somados (ms epoch). */
  startedAt: number;
  /** Há quanto tempo esta instância do servidor está de pé (segundos). */
  uptimeSeconds: number;
  queries: PerfStat[];
  blocks: PerfStat[];
  slowest: SlowQuery[];
  totalQueries: number;
  totalQueryMs: number;
};

export function getPerfSnapshot(): PerfSnapshot {
  const q = toStats(queries);
  return {
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    queries: q,
    blocks: toStats(blocks),
    slowest: [...slowest],
    totalQueries: q.reduce((s, x) => s + x.count, 0),
    totalQueryMs: q.reduce((s, x) => s + x.totalMs, 0),
  };
}

export function resetPerf() {
  queries.clear();
  blocks.clear();
  slowest.length = 0;
  startedAt = Date.now();
}
