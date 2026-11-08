#!/usr/bin/env node
/**
 * Cadastro de loja no catálogo (multi-loja), pela linha de comando.
 *
 *   node scripts/loja.mjs listar
 *   LOJA_DATABASE_URL=... [LOJA_DATABASE_URL_DIRETA=...] \
 *     node scripts/loja.mjs salvar <slug> "<nome>" [host1,host2] [--usa-ambiente] [--suspensa]
 *
 * A URL do banco vem de variável de ambiente (nunca como argumento, para não
 * ficar no histórico do terminal). Precisa de CATALOGO_DATABASE_URL e
 * CATALOGO_CHAVE. As migrações do banco novo rodam no próximo build (ou com
 * `DATABASE_URL=... npx prisma migrate deploy`).
 */
import { abrirCatalogo, listarLojas, salvarLoja } from "./catalogo.mjs";

try {
  process.loadEnvFile();
} catch {
  // sem .env
}

const [cmd, ...args] = process.argv.slice(2);
const db = abrirCatalogo();
if (!db) {
  console.error("CATALOGO_DATABASE_URL não definida.");
  process.exit(1);
}

const mascarar = (u) => {
  try {
    const x = new URL(u);
    return `${x.hostname}/${x.pathname.replace(/^\//, "")}`;
  } catch {
    return "(inválida)";
  }
};

try {
  if (cmd === "listar") {
    for (const l of await listarLojas(db)) {
      console.log(
        `${l.slug.padEnd(20)} ${l.status.padEnd(9)} ${l.usaAmbiente ? "ambiente" : "        "} ${mascarar(l.databaseUrl)}  ${l.hosts.join(", ")}  — ${l.nome}`,
      );
    }
  } else if (cmd === "salvar") {
    const flags = args.filter((a) => a.startsWith("--"));
    const [slug, nome, hosts] = args.filter((a) => !a.startsWith("--"));
    const databaseUrl = process.env.LOJA_DATABASE_URL?.trim();
    if (!slug || !nome || !databaseUrl) {
      console.error('Uso: LOJA_DATABASE_URL=... node scripts/loja.mjs salvar <slug> "<nome>" [hosts]');
      process.exit(1);
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
      console.error("Slug inválido: use minúsculas, números e hífen (3 a 40).");
      process.exit(1);
    }
    await salvarLoja(db, {
      slug,
      nome,
      hosts: hosts ? hosts.split(",") : [],
      databaseUrl,
      databaseUrlDireta: process.env.LOJA_DATABASE_URL_DIRETA?.trim() || null,
      usaAmbiente: flags.includes("--usa-ambiente"),
      status: flags.includes("--suspensa") ? "SUSPENSA" : "ATIVA",
    });
    console.log(`Loja ${slug} gravada.`);
  } else {
    console.error("Comandos: listar | salvar");
    process.exit(1);
  }
} finally {
  await db.$disconnect();
}
