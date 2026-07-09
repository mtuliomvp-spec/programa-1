#!/usr/bin/env node
/**
 * Prepara o banco antes do build na Vercel.
 * Aceita as variáveis de ambiente de qualquer integração de Postgres
 * da Vercel (Neon, Supabase, Vercel/Prisma Postgres) e aplica as
 * migrations. Falha com instruções claras se nenhum banco estiver
 * conectado ao projeto.
 */
import { spawnSync } from "node:child_process";

// Em uso local, carrega o .env (na Vercel as variáveis já vêm do ambiente)
try {
  process.loadEnvFile();
} catch {
  // sem .env — segue apenas com as variáveis do ambiente
}

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_POSTGRES_URL;

const directUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
  url;

if (!url) {
  console.error(
    [
      "",
      "==================================================================",
      "  ERRO: nenhum banco de dados conectado a este projeto.",
      "",
      "  Como resolver (menos de 2 minutos):",
      "  1. No painel do projeto na Vercel, abra a aba 'Storage'.",
      "  2. Clique em 'Create Database' e escolha 'Neon' (Postgres).",
      "  3. Aceite as opcoes padrao e conclua (Connect).",
      "  4. Volte em 'Deployments' e clique em 'Redeploy'.",
      "==================================================================",
      "",
    ].join("\n")
  );
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: directUrl },
});

process.exit(result.status ?? 1);
