/**
 * Resolve a URL do banco a partir das variáveis que as integrações da
 * Vercel costumam criar (Neon, Supabase, Vercel/Prisma Postgres),
 * para o deploy funcionar independente de qual banco foi conectado.
 */
export function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_POSTGRES_URL
  );
}

export function resolveDirectDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
    resolveDatabaseUrl()
  );
}
