import "server-only";
import { resolveDatabaseUrl } from "./db-url";

/**
 * Onde o banco está, sem expor credencial nenhuma.
 *
 * Serve para responder a pergunta que decide o diagnóstico de lentidão: o
 * servidor da aplicação e o banco estão perto um do outro? Neon e Supabase
 * carregam a região no próprio nome do host (`ep-xxx.sa-east-1.aws.neon.tech`),
 * então dá para comparar com a região da função (VERCEL_REGION) sem consultar
 * nada. Servidor em Washington com banco em São Paulo significa ~120 ms por ida
 * — e o farol faz dezenas delas por gravação.
 */

export type DbInfo = {
  /** Host com o meio ocultado (nunca traz usuário/senha). */
  host: string | null;
  provider: "Neon" | "Supabase" | "Postgres" | null;
  /** Região extraída do host, quando o provedor a expõe ali. */
  region: string | null;
  /** Conexão através do pooler (recomendado em serverless). */
  pooled: boolean | null;
  /** Região da função na Vercel, quando disponível. */
  serverRegion: string | null;
};

/** Mostra só as pontas do host: `ep-abc…aws.neon.tech`. */
function maskHost(host: string): string {
  if (host.length <= 24) return host;
  return `${host.slice(0, 10)}…${host.slice(-14)}`;
}

export function getDbInfo(): DbInfo {
  const serverRegion = process.env.VERCEL_REGION ?? null;
  const raw = resolveDatabaseUrl();
  if (!raw) return { host: null, provider: null, region: null, pooled: null, serverRegion };

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return { host: null, provider: null, region: null, pooled: null, serverRegion };
  }

  const provider = host.includes("neon.tech")
    ? ("Neon" as const)
    : host.includes("supabase")
      ? ("Supabase" as const)
      : ("Postgres" as const);

  // Região no nome do host: `...sa-east-1.aws.neon.tech`, `aws-0-us-east-1.pooler.supabase.com`.
  const region = /\b([a-z]{2}-[a-z]+-\d)\b/.exec(host)?.[1] ?? null;
  const pooled = host.includes("-pooler") || host.includes(".pooler.");

  return { host: maskHost(host), provider, region, pooled, serverRegion };
}
