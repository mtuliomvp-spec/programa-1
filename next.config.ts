import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Versão do sistema mostrada no menu, logo abaixo do nome da loja.
 *
 * É o NÚMERO DO PR que foi mesclado na produção: cada merge (squash) chega com
 * "(#362)" no assunto do commit, e a Vercel entrega esse assunto em
 * VERCEL_GIT_COMMIT_MESSAGE na hora do build. Fora da Vercel, lê do git local.
 * Sem PR no assunto (commit direto), cai no hash curto; sem git, "dev".
 */
function versaoDoBuild(): { versao: string; data: string } {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  const assunto = process.env.VERCEL_GIT_COMMIT_MESSAGE || git("git log -1 --format=%s");
  const pr = assunto.match(/\(#(\d+)\)/)?.[1];
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || git("git rev-parse HEAD")).slice(0, 7);
  const data = new Date().toISOString().slice(0, 10);
  return { versao: pr ?? (sha || "dev"), data };
}

const { versao, data } = versaoDoBuild();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: versao,
    NEXT_PUBLIC_APP_BUILD_DATE: data,
  },
  experimental: {
    // Permite restaurar backups grandes (upload do JSON via Server Action).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
