import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Chaves de serviços externos.
 *
 * Toda chave pode vir de dois lugares, nesta ordem:
 *  1. Parâmetros da empresa (banco) — o que a loja cadastrou para si;
 *  2. variável de ambiente da instalação — a chave da operadora do sistema,
 *     que faz a instalação nova já nascer funcionando.
 *
 * A da loja sempre vence: quem quiser usar (e pagar) a própria chave é
 * atendido, sem depender de quem hospeda.
 */

export type ResolvedKey = {
  value: string | null;
  configured: boolean;
  /** true quando a chave em uso veio do ambiente, não dos Parâmetros. */
  fromEnv: boolean;
};

function resolve(dbValue: string | null | undefined, envValue: string | undefined): ResolvedKey {
  const fromDb = dbValue?.trim() || null;
  const value = fromDb ?? (envValue?.trim() || null);
  return { value, configured: !!value, fromEnv: !fromDb && !!value };
}

/** Token da consulta por placa (o mesmo provedor devolve o valor FIPE). */
export async function getPlateToken(): Promise<ResolvedKey> {
  let dbToken: string | null = null;
  try {
    const c = await prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { plateApiToken: true },
    });
    dbToken = c?.plateApiToken ?? null;
  } catch {
    // Banco indisponível ou coluna ainda não migrada: cai para o ambiente.
  }
  return resolve(dbToken, process.env.PLACA_API_TOKEN);
}
