import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { resolveDatabaseUrl } from "./db-url";
import {
  buscarLojaPorHost,
  buscarLojaPorSlug,
  catalogoUrl,
  normalizarHost,
  SLUGS_RESERVADOS,
  type LojaCatalogo,
} from "./catalogo";

/**
 * De qual loja é esta requisição?
 *
 * - Uma loja só (sem CATALOGO_DATABASE_URL): sempre a "principal", com o banco
 *   das variáveis do projeto — exatamente o comportamento de antes.
 * - Multi-loja: pelo endereço acessado. `loja.fincore360.com.br` (subdomínio
 *   da plataforma, DOMINIO_PLATAFORMA) ou um domínio próprio cadastrado na
 *   loja (ex.: mvpveiculos.com.br). Endereço desconhecido fora da plataforma
 *   (ex.: o *.vercel.app do projeto) cai na LOJA_PADRAO, se houver.
 */

export type Loja = Pick<LojaCatalogo, "id" | "slug" | "nome" | "databaseUrl" | "segredos" | "usaAmbiente" | "status">;

export class LojaNaoEncontrada extends Error {
  constructor(host: string) {
    super(`Nenhuma loja do Fincore360 neste endereço (${host}).`);
    this.name = "LojaNaoEncontrada";
  }
}

export class LojaSuspensa extends Error {
  constructor(public readonly nome: string) {
    super(`A loja ${nome} está desativada no Fincore360.`);
    this.name = "LojaSuspensa";
  }
}

export class LojaPreparando extends Error {
  constructor(public readonly nome: string) {
    super(`A loja ${nome} está sendo preparada.`);
    this.name = "LojaPreparando";
  }
}

export function modoMultiLoja(): boolean {
  return catalogoUrl() != null;
}

const LOJA_UNICA_ID = "principal";

function lojaUnica(): Loja {
  return {
    id: LOJA_UNICA_ID,
    slug: LOJA_UNICA_ID,
    nome: "",
    databaseUrl: resolveDatabaseUrl() ?? "",
    segredos: {},
    usaAmbiente: true,
    status: "ATIVA",
  };
}

function dominioPlataforma(): string | null {
  return process.env.DOMINIO_PLATAFORMA?.trim().toLowerCase().replace(/^\.+/, "") || null;
}

// Endereço → loja, por 60 s (o catálogo muda pouco; suspender uma loja vale
// em até um minuto). Ausência fica 10 s, para uma loja recém-criada aparecer.
const memoria = new Map<string, { loja: Loja | null; ate: number }>();

async function resolverHost(host: string): Promise<Loja | null> {
  const agora = Date.now();
  const m = memoria.get(host);
  if (m && m.ate > agora) return m.loja;

  let loja: LojaCatalogo | null = null;
  const dominio = dominioPlataforma();
  if (dominio && host.endsWith(`.${dominio}`)) {
    const slug = host.slice(0, -(dominio.length + 1));
    // Só o primeiro nível (loja.dominio); www/app/admin são da plataforma.
    if (!slug.includes(".") && !SLUGS_RESERVADOS.has(slug)) loja = await buscarLojaPorSlug(slug);
  } else {
    loja = await buscarLojaPorHost(host);
    const padrao = process.env.LOJA_PADRAO?.trim();
    if (!loja && padrao && host !== dominio) loja = await buscarLojaPorSlug(padrao);
  }
  memoria.set(host, { loja, ate: agora + (loja ? 60_000 : 10_000) });
  return loja;
}

/** Endereço (host) da requisição atual, normalizado. */
export async function hostDaRequisicao(): Promise<string> {
  const h = await headers();
  return normalizarHost(h.get("x-forwarded-host") || h.get("host") || "");
}

// Loja escolhida à mão (painel da plataforma criando uma loja, rotinas que
// passam por todas): vale para tudo que rodar dentro do callback.
const escolhida = new AsyncLocalStorage<Loja>();

/** Roda `fn` com o banco (e os segredos) da loja indicada. */
export function comLoja<T>(loja: Loja, fn: () => Promise<T>): Promise<T> {
  return escolhida.run(loja, fn);
}

/**
 * A loja da requisição atual. Fora de uma requisição (scripts, build) só
 * funciona no modo de uma loja ou dentro de comLoja().
 */
export async function lojaAtual(): Promise<Loja> {
  const manual = escolhida.getStore();
  if (manual) return manual;
  if (!modoMultiLoja()) return lojaUnica();
  // Sem try/catch de propósito: no build o headers() avisa o Next (lançando)
  // que a página é dinâmica — engolir esse aviso quebra a compilação. Fora de
  // uma requisição (script) o erro do próprio Next já diz o que houve.
  const host = await hostDaRequisicao();
  const loja = await resolverHost(host);
  if (!loja) throw new LojaNaoEncontrada(host);
  if (loja.status === "SUSPENSA") throw new LojaSuspensa(loja.nome);
  if (loja.status === "PREPARANDO") throw new LojaPreparando(loja.nome);
  return loja;
}

/**
 * Situação do endereço acessado: "ok", "sem-loja" (nenhuma loja aqui) ou
 * "suspensa". A moldura do sistema usa para mostrar um aviso em vez de erro.
 */
export async function situacaoDaLoja(): Promise<"ok" | "sem-loja" | "suspensa" | "preparando" | "plataforma"> {
  if (await ehPainelDaPlataforma()) return "plataforma";
  try {
    await lojaAtual();
    return "ok";
  } catch (e) {
    if (e instanceof LojaNaoEncontrada) return "sem-loja";
    if (e instanceof LojaSuspensa) return "suspensa";
    if (e instanceof LojaPreparando) return "preparando";
    throw e;
  }
}

/**
 * Variável que é DA LOJA (certificado do Renave, tokens da Focus, token da
 * consulta por placa, APP_URL...). Na loja que usa o ambiente do projeto vem
 * de process.env, como sempre; nas demais, dos segredos dela no catálogo —
 * nunca das variáveis do projeto, que são da MVP.
 */
export async function variavelDaLoja(nome: string): Promise<string | undefined> {
  const loja = await lojaAtual();
  if (loja.usaAmbiente) return process.env[nome];
  return loja.segredos[nome];
}

/**
 * Endereço do painel da plataforma (o Fincore360, dono do sistema):
 * `admin.<DOMINIO_PLATAFORMA>`. Ali não há loja — só o cadastro das lojas.
 */
export function hostDoPainel(): string | null {
  const dominio = dominioPlataforma();
  return modoMultiLoja() && dominio ? `admin.${dominio}` : null;
}

export async function ehPainelDaPlataforma(): Promise<boolean> {
  const painel = hostDoPainel();
  return !!painel && (await hostDaRequisicao()) === painel;
}
