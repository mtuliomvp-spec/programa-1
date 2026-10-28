import "server-only";

/**
 * Valor FIPE pela TABELA PÚBLICA (API aberta que espelha a tabela da FIPE),
 * por marca, modelo e ano — sem o token pago da consulta por placa.
 *
 * Serve de reserva: a consulta por placa falhou (token sem saldo, provedor
 * fora) ou não trouxe a FIPE. A tabela pública não conhece a placa, então o
 * casamento é pelo texto do carro: a marca, o modelo (KWID), a versão (ZEN),
 * o câmbio (Mec./Aut.) e o ano-modelo. Devolve as versões candidatas da mais
 * provável para a menos provável — a tela mostra a lista para o usuário
 * confirmar a certa.
 *
 * Duas fontes, a segunda só quando a primeira não responde (limite diário,
 * bloqueio, fora do ar): a v1 e a v2 da mesma API pública (parallelum).
 * `FIPE_PUBLICA_URL` troca a base da v1; `FIPE_PUBLICA_V2_URL`, a da v2;
 * `FIPE_PUBLICA_TOKEN` (opcional) vai no cabeçalho da v2 e aumenta o limite.
 *
 * Quando nada sai, o motivo volta em palavras — a etapa e o código HTTP —,
 * para a tela não dizer só "não encontrei".
 */

export type FipePublicaOpcao = {
  modelo: string;
  price: number;
  codigoFipe: string | null;
  mesReferencia: string | null;
};

export type FipePublicaEntrada = {
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  anoModelo?: number | null;
  combustivel?: string | null;
  cambio?: string | null;
};

export type FipePublicaResultado = { opcoes: FipePublicaOpcao[]; erro?: string };

/** Como cada versão da API chama as rotas e os campos. */
type Fonte = {
  nome: string;
  base: string;
  headers: Record<string, string>;
  marcas: string;
  modelos: (marca: string) => string;
  anos: (marca: string, modelo: string) => string;
  valor: (marca: string, modelo: string, ano: string) => string;
  /** Lista de modelos: a v1 embrulha em { modelos: [...] }, a v2 não. */
  listaModelos: (json: unknown) => unknown[];
  codigo: (item: Record<string, unknown>) => string;
  nomeItem: (item: Record<string, unknown>) => string;
  campos: { valor: string; modelo: string; codigoFipe: string; mes: string };
};

const AGENTE = { "User-Agent": "Mozilla/5.0 (compatible; Fincore360/1.0)", Accept: "application/json" };

const FONTES: Fonte[] = [
  {
    nome: "tabela FIPE pública (v1)",
    base: (process.env.FIPE_PUBLICA_URL || "https://parallelum.com.br/fipe/api/v1").replace(/\/+$/, ""),
    headers: AGENTE,
    marcas: "/carros/marcas",
    modelos: (m) => `/carros/marcas/${m}/modelos`,
    anos: (m, mod) => `/carros/marcas/${m}/modelos/${mod}/anos`,
    valor: (m, mod, a) => `/carros/marcas/${m}/modelos/${mod}/anos/${a}`,
    listaModelos: (j) => ((j as { modelos?: unknown[] })?.modelos ?? []) as unknown[],
    codigo: (i) => String(i.codigo ?? ""),
    nomeItem: (i) => String(i.nome ?? ""),
    campos: { valor: "Valor", modelo: "Modelo", codigoFipe: "CodigoFipe", mes: "MesReferencia" },
  },
  {
    nome: "tabela FIPE pública (v2)",
    base: (process.env.FIPE_PUBLICA_V2_URL || "https://fipe.parallelum.com.br/api/v2").replace(/\/+$/, ""),
    headers: process.env.FIPE_PUBLICA_TOKEN
      ? { ...AGENTE, "X-Subscription-Token": process.env.FIPE_PUBLICA_TOKEN }
      : AGENTE,
    marcas: "/cars/brands",
    modelos: (m) => `/cars/brands/${m}/models`,
    anos: (m, mod) => `/cars/brands/${m}/models/${mod}/years`,
    valor: (m, mod, a) => `/cars/brands/${m}/models/${mod}/years/${a}`,
    listaModelos: (j) => (Array.isArray(j) ? j : []),
    codigo: (i) => String(i.code ?? ""),
    nomeItem: (i) => String(i.name ?? ""),
    campos: { valor: "price", modelo: "model", codigoFipe: "codeFipe", mes: "referenceMonth" },
  },
];

/** Sem acento, maiúsculo, só letras/números/ponto — para comparar nomes. */
const chave = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, " ")
    .trim();

const tokens = (s: string | null | undefined) => chave(s).split(" ").filter(Boolean);

/** A tabela escreve algumas marcas do seu jeito ("GM - Chevrolet", "VW - VolksWagen"). */
const APELIDOS: Record<string, string[]> = {
  CHEVROLET: ["GM", "CHEVROLET"],
  GM: ["GM", "CHEVROLET"],
  VOLKSWAGEN: ["VW", "VOLKSWAGEN"],
  VW: ["VW", "VOLKSWAGEN"],
  MERCEDES: ["MERCEDES"],
  "MERCEDES BENZ": ["MERCEDES"],
  MB: ["MERCEDES"],
  CITROEN: ["CITROEN"],
  "LAND ROVER": ["LAND"],
};

/** O que um código HTTP da tabela quer dizer, em palavras. */
function significado(status: number): string {
  if (status === 429) return "limite de consultas da tabela pública atingido — tente mais tarde";
  if (status === 401 || status === 403) return "a tabela pública recusou a consulta deste servidor";
  if (status >= 500) return "a tabela pública está fora do ar";
  if (status === 0) return "sem resposta da tabela pública (rede ou tempo esgotado)";
  return `resposta inesperada da tabela pública`;
}

/** Falha de COMUNICAÇÃO (vale tentar a outra fonte) — diferente de "não achei". */
class FalhaDaTabela extends Error {}

// Marcas e modelos mudam pouco: guardados na memória do servidor por 12 h
// (só respostas boas — um erro de limite não pode ficar "lembrado").
const memoria = new Map<string, { quando: number; json: unknown }>();
const VALIDADE = 12 * 60 * 60 * 1000;

async function getJson(fonte: Fonte, path: string, guardar = false): Promise<unknown> {
  const url = `${fonte.base}${path}`;
  const lembrado = guardar ? memoria.get(url) : undefined;
  if (lembrado && Date.now() - lembrado.quando < VALIDADE) return lembrado.json;
  let r: Response;
  try {
    r = await fetch(url, { headers: fonte.headers, cache: "no-store", signal: AbortSignal.timeout(12000) });
  } catch {
    throw new FalhaDaTabela(`${fonte.nome}: ${significado(0)}`);
  }
  if (!r.ok) throw new FalhaDaTabela(`${fonte.nome}: HTTP ${r.status} — ${significado(r.status)}`);
  let json: unknown;
  try {
    json = await r.json();
  } catch {
    throw new FalhaDaTabela(`${fonte.nome}: a resposta não veio em JSON`);
  }
  if (guardar) memoria.set(url, { quando: Date.now(), json });
  return json;
}

/** "R$ 61.234,00" → 61234 */
function valorBrl(v: unknown): number | null {
  if (typeof v === "number") return v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Pontua uma versão da tabela contra o carro: o modelo tem que estar no nome
 * (sem ele, fora); cada palavra da versão que aparece soma; câmbio e
 * combustível desempatam.
 */
function pontuar(nomeFipe: string, e: FipePublicaEntrada): number {
  const nome = tokens(nomeFipe);
  const modelo = tokens(e.modelo);
  if (!modelo.length || !modelo.every((m) => nome.includes(m))) return -1;
  let score = 10;
  for (const t of tokens(e.versao)) {
    if (modelo.includes(t)) continue;
    if (nome.includes(t)) score += 3;
  }
  const cambio = chave(e.cambio);
  const aut = nome.some((t) => t.startsWith("AUT") || t === "CVT" || t === "TIPTRONIC");
  if (/AUTOM|CVT/.test(cambio)) score += aut ? 2 : -2;
  else if (/MANUAL|MEC/.test(cambio)) score += aut ? -2 : 2;
  const comb = chave(e.combustivel);
  if (/DIESEL/.test(comb)) score += nome.includes("DIESEL") ? 2 : -1;
  return score;
}

const item = (x: unknown) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

/** A busca numa fonte. "Não achei" volta como `erro`; falha de rede, como exceção. */
async function buscarNa(fonte: Fonte, e: FipePublicaEntrada): Promise<FipePublicaResultado> {
  const marcas = (await getJson(fonte, fonte.marcas, true)) as unknown[];
  const km = chave(e.marca);
  const procuradas = APELIDOS[km] ?? [km.split(" ")[0]];
  const marca = (Array.isArray(marcas) ? marcas : []).map(item).find((m) => {
    const nome = fonte.nomeItem(m);
    return procuradas.some((p) => tokens(nome).includes(p) || chave(nome).startsWith(p));
  });
  if (!marca) return { opcoes: [], erro: `a marca "${e.marca}" não foi encontrada na tabela FIPE` };
  const codMarca = fonte.codigo(marca);

  const modelos = fonte.listaModelos(await getJson(fonte, fonte.modelos(codMarca), true)).map(item);
  const candidatos = modelos
    .map((m) => ({ codigo: fonte.codigo(m), nome: fonte.nomeItem(m), score: pontuar(fonte.nomeItem(m), e) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => b.score - a.score || a.nome.length - b.nome.length)
    // Cada candidato custa duas consultas: só os mais prováveis.
    .slice(0, 6);
  if (!candidatos.length) {
    return {
      opcoes: [],
      erro: `nenhum modelo "${e.modelo}" da ${fonte.nomeItem(marca)} na tabela FIPE (${modelos.length} modelos da marca) — confira o modelo`,
    };
  }

  // Código do ano na tabela: "2024-1" (gasolina/flex), "2024-2" (álcool),
  // "2024-3" (diesel); 0 km é "32000-x".
  const comb = chave(e.combustivel);
  const sufixo = /DIESEL/.test(comb) ? "3" : /ALCOOL|ETANOL/.test(comb) && !/GASOLINA|FLEX/.test(comb) ? "2" : "1";

  const opcoes: (FipePublicaOpcao & { score: number })[] = [];
  let anosVistos = 0;
  await Promise.all(
    candidatos.map(async (c) => {
      const anos = (await getJson(fonte, fonte.anos(codMarca, c.codigo))) as unknown[];
      const doAno = (Array.isArray(anos) ? anos : [])
        .map(item)
        .map((a) => fonte.codigo(a))
        .filter((cod) => cod.startsWith(`${e.anoModelo}-`));
      const ano = doAno.find((cod) => cod.endsWith(`-${sufixo}`)) ?? doAno[0];
      if (!ano) return;
      anosVistos += 1;
      const v = item(await getJson(fonte, fonte.valor(codMarca, c.codigo, ano)));
      const price = valorBrl(v[fonte.campos.valor]);
      if (!price) return;
      opcoes.push({
        modelo: String(v[fonte.campos.modelo] || c.nome),
        price,
        codigoFipe: typeof v[fonte.campos.codigoFipe] === "string" ? (v[fonte.campos.codigoFipe] as string) : null,
        mesReferencia: typeof v[fonte.campos.mes] === "string" ? (v[fonte.campos.mes] as string).trim() : null,
        score: c.score,
      });
    }),
  );
  if (!opcoes.length) {
    return {
      opcoes: [],
      erro: anosVistos
        ? "a tabela FIPE não informou o valor para este ano"
        : `nenhuma versão do ${e.modelo} com ano-modelo ${e.anoModelo} na tabela FIPE — confira o ano modelo`,
    };
  }
  opcoes.sort((a, b) => b.score - a.score || a.modelo.length - b.modelo.length);
  return {
    opcoes: opcoes.map(({ modelo, price, codigoFipe, mesReferencia }) => ({ modelo, price, codigoFipe, mesReferencia })),
  };
}

/**
 * Versões FIPE prováveis do carro, com o valor do mês, da mais provável para a
 * menos provável — ou o motivo, em palavras, de não ter saído nada.
 */
export async function fipePublicaDetalhada(e: FipePublicaEntrada): Promise<FipePublicaResultado> {
  if (!e.marca || !e.modelo || !e.anoModelo) {
    return { opcoes: [], erro: "preencha marca, modelo e ano modelo para buscar na tabela FIPE" };
  }
  const falhas: string[] = [];
  for (const fonte of FONTES) {
    try {
      return await buscarNa(fonte, e);
    } catch (err) {
      // Falha de comunicação: tenta a outra fonte; as duas falhando, o motivo
      // de cada uma vai para a tela.
      falhas.push(err instanceof Error ? err.message : `${fonte.nome}: falha`);
    }
  }
  return { opcoes: [], erro: falhas.join(" · ") };
}

/** Só as versões (vazio quando não saiu nada). */
export async function fipePublica(e: FipePublicaEntrada): Promise<FipePublicaOpcao[]> {
  return (await fipePublicaDetalhada(e)).opcoes;
}
