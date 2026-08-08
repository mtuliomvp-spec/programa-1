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

/**
 * Regiões da Vercel → região AWS equivalente e nome da cidade.
 *
 * Precisa desta tabela porque os dois códigos não se parecem: a Vercel usa o
 * código do aeroporto (`gru1` = Guarulhos) e a AWS usa `sa-east-1`. A primeira
 * versão desta tela comparava os textos e dizia "regiões diferentes" mesmo com
 * servidor e banco em São Paulo.
 */
const VERCEL_REGIONS: Record<string, { aws: string; label: string }> = {
  arn1: { aws: "eu-north-1", label: "Estocolmo" },
  bom1: { aws: "ap-south-1", label: "Mumbai" },
  cdg1: { aws: "eu-west-3", label: "Paris" },
  cle1: { aws: "us-east-2", label: "Cleveland" },
  cpt1: { aws: "af-south-1", label: "Cidade do Cabo" },
  dub1: { aws: "eu-west-1", label: "Dublin" },
  fra1: { aws: "eu-central-1", label: "Frankfurt" },
  gru1: { aws: "sa-east-1", label: "São Paulo" },
  hkg1: { aws: "ap-east-1", label: "Hong Kong" },
  hnd1: { aws: "ap-northeast-1", label: "Tóquio" },
  iad1: { aws: "us-east-1", label: "Washington" },
  icn1: { aws: "ap-northeast-2", label: "Seul" },
  kix1: { aws: "ap-northeast-3", label: "Osaka" },
  lhr1: { aws: "eu-west-2", label: "Londres" },
  pdx1: { aws: "us-west-2", label: "Portland" },
  sfo1: { aws: "us-west-1", label: "São Francisco" },
  sin1: { aws: "ap-southeast-1", label: "Singapura" },
  syd1: { aws: "ap-southeast-2", label: "Sydney" },
};

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
  /** Cidade da região da função (ex.: "São Paulo"), quando conhecida. */
  serverRegionLabel: string | null;
  /** Servidor e banco na mesma região. `null` = não dá para afirmar. */
  sameRegion: boolean | null;
};

/** Mostra só as pontas do host: `ep-abc…aws.neon.tech`. */
function maskHost(host: string): string {
  if (host.length <= 24) return host;
  return `${host.slice(0, 10)}…${host.slice(-14)}`;
}

export function getDbInfo(): DbInfo {
  const serverRegion = process.env.VERCEL_REGION ?? null;
  const server = serverRegion ? VERCEL_REGIONS[serverRegion.toLowerCase()] : undefined;
  const serverRegionLabel = server?.label ?? null;
  const base = { serverRegion, serverRegionLabel };
  const raw = resolveDatabaseUrl();
  if (!raw) {
    return { ...base, host: null, provider: null, region: null, pooled: null, sameRegion: null };
  }

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return { ...base, host: null, provider: null, region: null, pooled: null, sameRegion: null };
  }

  const provider = host.includes("neon.tech")
    ? ("Neon" as const)
    : host.includes("supabase")
      ? ("Supabase" as const)
      : ("Postgres" as const);

  // Região no nome do host: `...sa-east-1.aws.neon.tech`, `aws-0-us-east-1.pooler.supabase.com`.
  const region = /\b([a-z]{2}-[a-z]+-\d)\b/.exec(host)?.[1] ?? null;
  const pooled = host.includes("-pooler") || host.includes(".pooler.");

  // Só afirma "diferente" quando dá para comparar de verdade: sem a região do
  // banco no host, ou com um código de região da Vercel fora da tabela, o
  // honesto é dizer que não dá para saber — não acusar um problema que pode
  // não existir.
  const sameRegion = region && server ? server.aws === region : null;

  return { ...base, host: maskHost(host), provider, region, pooled, sameRegion };
}
