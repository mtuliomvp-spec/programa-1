import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./db-url";
import { recordQuery } from "./perf";
import { lojaAtual, modoMultiLoja } from "./tenant";

/**
 * Cliente do Prisma com cronômetro em toda consulta (ver src/lib/perf.ts e a
 * tela Sistema › Desempenho). O custo é um `performance.now()` por consulta.
 */
function build(datasourceUrl: string | undefined) {
  return new PrismaClient({ datasourceUrl }).$extends({
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

type Cliente = ReturnType<typeof build>;

const globalForPrisma = globalThis as unknown as {
  prisma: Cliente | undefined;
  prismaPorLoja: Map<string, Cliente> | undefined;
};

/**
 * Cliente do banco de uma loja. Um por banco e por instância do servidor —
 * guardado no globalThis porque o Next cria bundles separados para páginas,
 * server actions e route handlers, e sem isto cada um abriria o seu próprio
 * pool de conexões contra o mesmo banco.
 */
export function clienteDoBanco(url: string): Cliente {
  const mapa = (globalForPrisma.prismaPorLoja ??= new Map());
  let c = mapa.get(url);
  if (!c) {
    c = build(url);
    mapa.set(url, c);
  }
  return c;
}

async function clienteDaLoja(): Promise<Cliente> {
  const loja = await lojaAtual();
  if (!loja.databaseUrl) throw new Error(`Loja ${loja.slug} sem banco configurado.`);
  return clienteDoBanco(loja.databaseUrl);
}

// ---------------------------------------------------------------------------
// Multi-loja: o `prisma` de todo o sistema descobre a loja na hora da consulta
// ---------------------------------------------------------------------------

const OPERACAO = Symbol("operacao-adiada");
type Executor = (c: Cliente) => unknown;

/**
 * Consulta que só sai quando é aguardada (como a PrismaPromise do próprio
 * Prisma). Guarda como se refaz no cliente certo, para o
 * `$transaction([...])` em lista montar as consultas no banco da loja.
 */
function adiar(executar: Executor) {
  let promessa: Promise<unknown> | null = null;
  const rodar = () => (promessa ??= clienteDaLoja().then((c) => executar(c)));
  return {
    [OPERACAO]: executar,
    then: (ok?: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro),
    catch: (erro?: (e: unknown) => unknown) => rodar().catch(erro),
    finally: (fim?: () => void) => rodar().finally(fim),
    [Symbol.toStringTag]: "PrismaPromise",
  };
}

type Dinamico = Record<string, (...args: unknown[]) => unknown>;

function prismaMultiLoja(): Cliente {
  const modelos = new Map<string, unknown>();
  return new Proxy({} as Cliente, {
    get(_alvo, prop) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      if (prop === "$transaction") {
        return (arg: unknown, opcoes?: unknown) =>
          clienteDaLoja().then((c) => {
            const tx = (c as unknown as Dinamico).$transaction;
            if (typeof arg === "function") return tx.call(c, arg, opcoes);
            const lista = (arg as unknown[]).map((op) => {
              const ex = (op as { [OPERACAO]?: Executor })?.[OPERACAO];
              return ex ? ex(c) : op;
            });
            return tx.call(c, lista, opcoes);
          });
      }
      if (prop.startsWith("$")) {
        return (...args: unknown[]) => adiar((c) => (c as unknown as Dinamico)[prop](...args));
      }
      let modelo = modelos.get(prop);
      if (!modelo) {
        modelo = new Proxy(
          {},
          {
            get(_m, metodo) {
              if (typeof metodo !== "string" || metodo === "then") return undefined;
              return (...args: unknown[]) =>
                adiar((c) => ((c as unknown as Record<string, Dinamico>)[prop])[metodo](...args));
            },
          },
        );
        modelos.set(prop, modelo);
      }
      return modelo;
    },
  });
}

/**
 * O `prisma` usado em todo o sistema.
 *
 * - Uma loja só: o cliente do banco das variáveis do projeto, direto — igual
 *   a sempre (nenhuma camada a mais).
 * - Multi-loja: um intermediário que, a cada consulta, descobre a loja pelo
 *   endereço acessado (src/lib/tenant.ts) e usa o banco DELA.
 */
export const prisma: Cliente = modoMultiLoja()
  ? prismaMultiLoja()
  : (globalForPrisma.prisma ??= build(resolveDatabaseUrl()));

/**
 * Cliente de transação do cliente estendido (o `tx` de `prisma.$transaction`).
 * Substitui `Prisma.TransactionClient`, que descreve o cliente SEM extensão.
 */
export type TransactionClient = Parameters<Parameters<Cliente["$transaction"]>[0]>[0];
