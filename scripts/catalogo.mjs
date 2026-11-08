/**
 * Acesso ao catálogo de lojas pelos scripts (build e linha de comando).
 * Mesma tabela e mesma cifra de src/lib/catalogo.ts — manter os dois iguais.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function chave() {
  const base = process.env.CATALOGO_CHAVE?.trim();
  if (!base || base.length < 32) {
    throw new Error("CATALOGO_CHAVE ausente ou curta (mínimo 32 caracteres).");
  }
  return createHash("sha256").update(base).digest();
}

export function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), corpo.toString("base64url")].join(":");
}

export function decifrar(cifrado) {
  const [v, iv, tag, corpo] = cifrado.split(":");
  if (v !== "v1" || !iv || !tag || !corpo) throw new Error("Valor cifrado do catálogo em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(corpo, "base64url")), d.final()]).toString("utf8");
}

export function abrirCatalogo() {
  const url = process.env.CATALOGO_DATABASE_URL?.trim();
  if (!url) return null;
  return new PrismaClient({ datasourceUrl: url });
}

export async function garantirTabela(db) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS lojas (
      id               text PRIMARY KEY,
      slug             text NOT NULL UNIQUE,
      nome             text NOT NULL,
      hosts            text[] NOT NULL DEFAULT '{}',
      banco_cifrado    text NOT NULL,
      banco_direto_cifrado text,
      segredos_cifrados text,
      usa_ambiente     boolean NOT NULL DEFAULT false,
      status           text NOT NULL DEFAULT 'ATIVA',
      criado_em        timestamptz NOT NULL DEFAULT now(),
      atualizado_em    timestamptz NOT NULL DEFAULT now()
    )`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS lojas_hosts_idx ON lojas USING gin (hosts)`);
}

/** Lojas com os bancos decifrados (sem os segredos). */
export async function listarLojas(db) {
  await garantirTabela(db);
  const linhas = await db.$queryRawUnsafe(
    `SELECT slug, nome, hosts, banco_cifrado, banco_direto_cifrado, usa_ambiente, status FROM lojas ORDER BY criado_em`,
  );
  return linhas.map((l) => ({
    slug: l.slug,
    nome: l.nome,
    hosts: l.hosts,
    usaAmbiente: l.usa_ambiente,
    status: l.status,
    databaseUrl: decifrar(l.banco_cifrado),
    databaseUrlDireta: l.banco_direto_cifrado ? decifrar(l.banco_direto_cifrado) : null,
  }));
}

export async function salvarLoja(db, d) {
  await garantirTabela(db);
  const hosts = [...new Set((d.hosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean))];
  await db.$executeRaw`
    INSERT INTO lojas (id, slug, nome, hosts, banco_cifrado, banco_direto_cifrado, usa_ambiente, status)
    VALUES (${randomUUID()}, ${d.slug}, ${d.nome}, ${hosts}, ${cifrar(d.databaseUrl)},
            ${d.databaseUrlDireta ? cifrar(d.databaseUrlDireta) : null}, ${Boolean(d.usaAmbiente)}, ${d.status ?? "ATIVA"})
    ON CONFLICT (slug) DO UPDATE SET
      nome = EXCLUDED.nome,
      hosts = EXCLUDED.hosts,
      banco_cifrado = EXCLUDED.banco_cifrado,
      banco_direto_cifrado = EXCLUDED.banco_direto_cifrado,
      usa_ambiente = EXCLUDED.usa_ambiente,
      status = EXCLUDED.status,
      atualizado_em = now()`;
}
