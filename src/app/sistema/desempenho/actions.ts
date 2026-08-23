"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { resetPerf } from "@/lib/perf";

async function assertAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") throw new Error("Acesso restrito ao Super Admin.");
}

/**
 * Mede a latência de UMA ida ao banco, repetida 10 vezes em fila.
 *
 * É o número que separa os dois diagnósticos possíveis: se cada ida custa
 * poucos milissegundos, a lentidão é "consultas demais" e se resolve no código;
 * se custa dezenas ou centenas, o banco está longe do servidor e nenhuma
 * otimização de código compensa — o caminho é aproximar os dois.
 */
export async function pingDatabaseAction(): Promise<{
  ok: boolean;
  samples?: number[];
  avgMs?: number;
  minMs?: number;
  maxMs?: number;
  error?: string;
}> {
  try {
    await assertAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const samples: number[] = [];
  try {
    // A primeira é descartada: paga a abertura da conexão, não o trajeto.
    await prisma.$queryRaw`SELECT 1`;
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      samples.push(performance.now() - t0);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao medir." };
  }
  return {
    ok: true,
    samples,
    avgMs: samples.reduce((s, n) => s + n, 0) / samples.length,
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
  };
}

export async function resetPerfAction() {
  await assertAdmin();
  resetPerf();
  revalidatePath("/sistema/desempenho");
}
