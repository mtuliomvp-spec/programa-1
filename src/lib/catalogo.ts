import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Catálogo de lojas do Fincore360 (modo multi-loja).
 *
 * Um banco PEQUENO e separado (variável CATALOGO_DATABASE_URL) com uma linha
 * por loja assinante: o subdomínio, os domínios próprios, o banco dela e os
 * segredos dela (certificado do Renave, tokens da Focus...). Os dados da loja
 * — estoque, vendas, financeiro — ficam no banco DELA, nunca aqui.
 *
 * A URL do banco e os segredos são gravados cifrados (AES-256-GCM) com a
 * chave da variável CATALOGO_CHAVE: quem ler o catálogo sem a chave não chega
 * aos bancos das lojas.
 *
 * Sem CATALOGO_DATABASE_URL o sistema é de uma loja só (como sempre foi) e
 * nada aqui é usado.
 */

/**
 * PREPARANDO: criada no painel da plataforma, esperando a próxima publicação
 * montar as tabelas e o administrador inicial (scripts/vercel-build.mjs).
 */
export type LojaStatus = "ATIVA" | "SUSPENSA" | "PREPARANDO";

export type LojaCatalogo = {
  id: string;
  slug: string;
  nome: string;
  hosts: string[];
  databaseUrl: string;
  /** Conexão direta (sem pooler), usada pelas migrações; vazia = a mesma. */
  databaseUrlDireta: string | null;
  /** Segredos da loja (ex.: RENAVE_CERT_PFX_BASE64), já decifrados. */
  segredos: Record<string, string>;
  /**
   * A loja usa as variáveis de ambiente do projeto (certificado, tokens,
   * APP_URL). Só a loja que veio da instalação de uma loja só (a MVP) — as
   * demais têm os próprios segredos no catálogo.
   */
  usaAmbiente: boolean;
  status: LojaStatus;
  criadoEm: Date;
  /** Administrador inicial ainda não criado no banco da loja. */
  adminPendente: boolean;
};

export function catalogoUrl(): string | null {
  return process.env.CATALOGO_DATABASE_URL?.trim() || null;
}

// ---------------------------------------------------------------------------
// Cifra
// ---------------------------------------------------------------------------

function chave(): Buffer {
  const base = process.env.CATALOGO_CHAVE?.trim();
  if (!base || base.length < 32) {
    throw new Error("CATALOGO_CHAVE ausente ou curta (mínimo 32 caracteres): o catálogo de lojas não pode ser lido.");
  }
  return createHash("sha256").update(base).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), corpo.toString("base64url")].join(":");
}

export function decifrar(cifrado: string): string {
  const [v, iv, tag, corpo] = cifrado.split(":");
  if (v !== "v1" || !iv || !tag || !corpo) throw new Error("Valor cifrado do catálogo em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(corpo, "base64url")), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Acesso ao banco do catálogo (só SQL puro: as tabelas da loja não existem lá)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { catalogoCliente?: PrismaClient; catalogoPronto?: Promise<void> };

function cliente(): PrismaClient {
  const url = catalogoUrl();
  if (!url) throw new Error("Catálogo de lojas não configurado (CATALOGO_DATABASE_URL).");
  g.catalogoCliente ??= new PrismaClient({ datasourceUrl: url });
  return g.catalogoCliente;
}

/** Cria a tabela do catálogo na primeira vez (idempotente). */
async function pronto(): Promise<PrismaClient> {
  const c = cliente();
  g.catalogoPronto ??= (async () => {
    await c.$executeRawUnsafe(`
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
    await c.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS lojas_hosts_idx ON lojas USING gin (hosts)`);
    await c.$executeRawUnsafe(`ALTER TABLE lojas ADD COLUMN IF NOT EXISTS admin_pendente_cifrado text`);
  })().catch((e) => {
    g.catalogoPronto = undefined;
    throw e;
  });
  await g.catalogoPronto;
  return c;
}

type Linha = {
  id: string;
  slug: string;
  nome: string;
  hosts: string[];
  banco_cifrado: string;
  banco_direto_cifrado: string | null;
  segredos_cifrados: string | null;
  usa_ambiente: boolean;
  status: string;
  criado_em: Date;
  admin_pendente_cifrado: string | null;
};

function daLinha(l: Linha): LojaCatalogo {
  return {
    id: l.id,
    slug: l.slug,
    nome: l.nome,
    hosts: l.hosts,
    databaseUrl: decifrar(l.banco_cifrado),
    databaseUrlDireta: l.banco_direto_cifrado ? decifrar(l.banco_direto_cifrado) : null,
    segredos: l.segredos_cifrados ? (JSON.parse(decifrar(l.segredos_cifrados)) as Record<string, string>) : {},
    usaAmbiente: l.usa_ambiente,
    status: l.status === "SUSPENSA" || l.status === "PREPARANDO" ? l.status : "ATIVA",
    criadoEm: l.criado_em,
    adminPendente: !!l.admin_pendente_cifrado,
  };
}

/** Slug válido de subdomínio: minúsculas, números e hífen (3 a 40). */
export function slugValido(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) && !SLUGS_RESERVADOS.has(slug);
}

/** Subdomínios da própria plataforma — nunca viram loja. */
export const SLUGS_RESERVADOS = new Set(["www", "app", "admin", "api", "painel", "demo", "assinar", "suporte", "mail", "entrar", "sair"]);

export function normalizarHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export async function buscarLojaPorSlug(slug: string): Promise<LojaCatalogo | null> {
  const c = await pronto();
  const linhas = await c.$queryRaw<Linha[]>`SELECT * FROM lojas WHERE slug = ${slug} LIMIT 1`;
  return linhas[0] ? daLinha(linhas[0]) : null;
}

export async function buscarLojaPorHost(host: string): Promise<LojaCatalogo | null> {
  const c = await pronto();
  const h = normalizarHost(host);
  const linhas = await c.$queryRaw<Linha[]>`SELECT * FROM lojas WHERE ${h} = ANY(hosts) LIMIT 1`;
  return linhas[0] ? daLinha(linhas[0]) : null;
}

export async function listarLojas(): Promise<LojaCatalogo[]> {
  const c = await pronto();
  const linhas = await c.$queryRaw<Linha[]>`SELECT * FROM lojas ORDER BY criado_em`;
  return linhas.map(daLinha);
}

export async function salvarLoja(dados: {
  slug: string;
  nome: string;
  hosts?: string[];
  databaseUrl: string;
  databaseUrlDireta?: string | null;
  segredos?: Record<string, string>;
  usaAmbiente?: boolean;
  status?: LojaStatus;
}): Promise<LojaCatalogo> {
  if (!slugValido(dados.slug)) throw new Error(`Subdomínio inválido ou reservado: "${dados.slug}".`);
  const c = await pronto();
  const hosts = [...new Set((dados.hosts ?? []).map(normalizarHost).filter(Boolean))];
  const banco = cifrar(dados.databaseUrl);
  const direto = dados.databaseUrlDireta ? cifrar(dados.databaseUrlDireta) : null;
  const segredos = dados.segredos && Object.keys(dados.segredos).length ? cifrar(JSON.stringify(dados.segredos)) : null;
  await c.$executeRaw`
    INSERT INTO lojas (id, slug, nome, hosts, banco_cifrado, banco_direto_cifrado, segredos_cifrados, usa_ambiente, status)
    VALUES (${randomUUID()}, ${dados.slug}, ${dados.nome}, ${hosts}, ${banco}, ${direto}, ${segredos},
            ${dados.usaAmbiente ?? false}, ${dados.status ?? "ATIVA"})
    ON CONFLICT (slug) DO UPDATE SET
      nome = EXCLUDED.nome,
      hosts = EXCLUDED.hosts,
      banco_cifrado = EXCLUDED.banco_cifrado,
      banco_direto_cifrado = EXCLUDED.banco_direto_cifrado,
      segredos_cifrados = COALESCE(EXCLUDED.segredos_cifrados, lojas.segredos_cifrados),
      usa_ambiente = EXCLUDED.usa_ambiente,
      status = EXCLUDED.status,
      atualizado_em = now()`;
  const salva = await buscarLojaPorSlug(dados.slug);
  if (!salva) throw new Error("Loja não ficou gravada no catálogo.");
  return salva;
}

/** Administrador inicial que a publicação cria no banco da loja nova. */
export type AdminInicial = { nome: string; email: string; senhaHash: string };

/**
 * Loja nova, criada pelo painel da plataforma: fica PREPARANDO até a próxima
 * publicação aplicar as migrações no banco dela e criar o administrador.
 */
export async function criarLoja(dados: {
  slug: string;
  nome: string;
  hosts?: string[];
  databaseUrl: string;
  databaseUrlDireta?: string | null;
  admin: AdminInicial;
  empresa: { razaoSocial: string; cnpj?: string | null };
}): Promise<LojaCatalogo> {
  if (!slugValido(dados.slug)) throw new Error(`Subdomínio inválido ou reservado: "${dados.slug}".`);
  if (await buscarLojaPorSlug(dados.slug)) throw new Error(`Já existe uma loja com o subdomínio "${dados.slug}".`);
  const c = await pronto();
  const hosts = [...new Set((dados.hosts ?? []).map(normalizarHost).filter(Boolean))];
  const pendente = cifrar(JSON.stringify({ admin: dados.admin, empresa: { ...dados.empresa, nomeFantasia: dados.nome } }));
  await c.$executeRaw`
    INSERT INTO lojas (id, slug, nome, hosts, banco_cifrado, banco_direto_cifrado, usa_ambiente, status, admin_pendente_cifrado)
    VALUES (${randomUUID()}, ${dados.slug}, ${dados.nome}, ${hosts}, ${cifrar(dados.databaseUrl)},
            ${dados.databaseUrlDireta ? cifrar(dados.databaseUrlDireta) : null}, false, 'PREPARANDO', ${pendente})`;
  const nova = await buscarLojaPorSlug(dados.slug);
  if (!nova) throw new Error("Loja não ficou gravada no catálogo.");
  return nova;
}

/** Nome, domínios próprios e situação (a situação PREPARANDO não se escolhe). */
export async function atualizarLoja(
  slug: string,
  dados: { nome?: string; hosts?: string[]; status?: "ATIVA" | "SUSPENSA" },
): Promise<void> {
  const atual = await buscarLojaPorSlug(slug);
  if (!atual) throw new Error("Loja não encontrada.");
  const c = await pronto();
  const hosts = dados.hosts ? [...new Set(dados.hosts.map(normalizarHost).filter(Boolean))] : atual.hosts;
  // Um domínio só pode ser de UMA loja.
  for (const h of hosts) {
    const dono = await buscarLojaPorHost(h);
    if (dono && dono.slug !== slug) throw new Error(`O domínio ${h} já é da loja ${dono.slug}.`);
  }
  const status = atual.status === "PREPARANDO" ? "PREPARANDO" : (dados.status ?? atual.status);
  await c.$executeRaw`
    UPDATE lojas SET nome = ${dados.nome?.trim() || atual.nome}, hosts = ${hosts}, status = ${status},
      atualizado_em = now()
    WHERE slug = ${slug}`;
}

/**
 * Grava segredos da loja (certificado do Renave, tokens...). Valor vazio ou
 * null APAGA o segredo; os não citados ficam como estão.
 */
export async function atualizarSegredos(slug: string, mudancas: Record<string, string | null>): Promise<void> {
  const atual = await buscarLojaPorSlug(slug);
  if (!atual) throw new Error("Loja não encontrada.");
  const segredos = { ...atual.segredos };
  for (const [k, v] of Object.entries(mudancas)) {
    if (v == null || v === "") delete segredos[k];
    else segredos[k] = v;
  }
  const c = await pronto();
  const cifrado = Object.keys(segredos).length ? cifrar(JSON.stringify(segredos)) : null;
  await c.$executeRaw`UPDATE lojas SET segredos_cifrados = ${cifrado}, atualizado_em = now() WHERE slug = ${slug}`;
}
