import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./db-url";
import { recordQuery } from "./perf";

/**
 * Cliente do Prisma com cronômetro em toda consulta (ver src/lib/perf.ts e a
 * tela Sistema › Desempenho). O custo é um `performance.now()` por consulta.
 */
function build() {
  return new PrismaClient({ datasourceUrl: resolveDatabaseUrl() }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const t0 = performance.now();
          try {
            return await query(args);
          } finally {
            recordQuery(model, operation, performance.now() - t0);
          }
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof build> | undefined;
};

// O singleton vale TAMBÉM em produção: o Next cria bundles separados para
// páginas, server actions e route handlers, e sem isto cada um abriria o seu
// próprio cliente (e o seu próprio pool de conexões) contra o mesmo banco.
export const prisma = globalForPrisma.prisma ?? build();
globalForPrisma.prisma = prisma;

/**
 * Cliente de transação do cliente estendido (o `tx` de `prisma.$transaction`).
 * Substitui `Prisma.TransactionClient`, que descreve o cliente SEM extensão.
 */
export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
