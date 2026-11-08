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

function migrar(rotulo, banco, direto) {
  console.log(`\n▶ Migrações: ${rotulo}`);
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: banco, DATABASE_URL_UNPOOLED: direto || banco },
  });
  return r.status ?? 1;
}

const status = migrar("banco do projeto", url, directUrl);
if (status !== 0) process.exit(status);

// Multi-loja: o mesmo código atende todas as lojas do catálogo, então TODO
// banco de loja recebe as migrações desta versão antes de ela entrar no ar.
// Uma loja que falhar derruba o build — publicar com um banco atrasado
// quebraria aquela loja.
if (process.env.CATALOGO_DATABASE_URL) {
  const { abrirCatalogo, listarLojas, concluirPreparo, salvarLoja } = await import("./catalogo.mjs");
  const db = abrirCatalogo();
  let lojas = await listarLojas(db);

  // Virada de uma loja só para o multi-loja: a loja que JÁ mora neste projeto
  // (LOJA_PADRAO, ex.: "mvp") entra no catálogo sozinha, com o banco do
  // projeto e as variáveis dele (certificado, tokens) — sem passo manual.
  const padrao = process.env.LOJA_PADRAO?.trim();
  if (padrao && !lojas.some((l) => l.slug === padrao)) {
    await salvarLoja(db, {
      slug: padrao,
      nome: process.env.LOJA_PADRAO_NOME?.trim() || padrao.toUpperCase(),
      hosts: [],
      databaseUrl: url,
      databaseUrlDireta: directUrl,
      usaAmbiente: true,
    });
    console.log(`✓ Loja ${padrao} (banco do projeto) cadastrada no catálogo.`);
    lojas = await listarLojas(db);
  }
  const feitos = new Set([url]);
  for (const loja of lojas) {
    if (!feitos.has(loja.databaseUrl)) {
      feitos.add(loja.databaseUrl);
      const s = migrar(`loja ${loja.slug}`, loja.databaseUrl, loja.databaseUrlDireta);
      if (s !== 0) {
        await db.$disconnect();
        console.error(`\nERRO: migrações da loja ${loja.slug} falharam — build interrompido.`);
        process.exit(s);
      }
    }
    // Loja criada no painel da plataforma: com as tabelas prontas, cria o
    // administrador inicial e libera a loja.
    if (await concluirPreparo(db, loja)) console.log(`✓ Loja ${loja.slug} pronta (administrador criado).`);
  }
  await db.$disconnect();
}

process.exit(0);
