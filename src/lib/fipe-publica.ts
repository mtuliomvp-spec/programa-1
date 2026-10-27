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
 * `FIPE_PUBLICA_URL` (opcional) troca a base da API; padrão:
 * https://parallelum.com.br/fipe/api/v1
 */

const BASE = (process.env.FIPE_PUBLICA_URL || "https://parallelum.com.br/fipe/api/v1").replace(/\/+$/, "");

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
  "MB": ["MERCEDES"],
  CITROEN: ["CITROEN"],
  "LAND ROVER": ["LAND"],
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      signal: AbortSignal.timeout(12000),
      // Marcas e modelos mudam pouco; o valor muda uma vez por mês.
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
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

/**
 * Versões FIPE prováveis do carro, com o valor do mês, da mais provável para a
 * menos provável. Vazio quando não deu para casar (marca/modelo/ano ausentes
 * ou não encontrados) ou a tabela não respondeu.
 */
export async function fipePublica(e: FipePublicaEntrada): Promise<FipePublicaOpcao[]> {
  if (!e.marca || !e.modelo || !e.anoModelo) return [];

  const marcas = await getJson<{ codigo: string; nome: string }[]>("/carros/marcas");
  if (!marcas?.length) return [];
  const km = chave(e.marca);
  const procuradas = APELIDOS[km] ?? [km.split(" ")[0]];
  const marca = marcas.find((m) => {
    const nome = tokens(m.nome);
    return procuradas.some((p) => nome.includes(p) || chave(m.nome).startsWith(p));
  });
  if (!marca) return [];

  const lista = await getJson<{ modelos: { codigo: number | string; nome: string }[] }>(
    `/carros/marcas/${marca.codigo}/modelos`,
  );
  const candidatos = (lista?.modelos ?? [])
    .map((m) => ({ ...m, score: pontuar(m.nome, e) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => b.score - a.score || a.nome.length - b.nome.length)
    // Cada candidato custa duas consultas: só os mais prováveis.
    .slice(0, 6);
  if (!candidatos.length) return [];

  // Código do ano na tabela: "2024-1" (gasolina/flex), "2024-2" (álcool),
  // "2024-3" (diesel); 0 km é "32000-x".
  const diesel = /DIESEL/.test(chave(e.combustivel));
  const alcool = /ALCOOL|ETANOL/.test(chave(e.combustivel)) && !/GASOLINA|FLEX/.test(chave(e.combustivel));
  const sufixo = diesel ? "3" : alcool ? "2" : "1";

  const opcoes: (FipePublicaOpcao & { score: number })[] = [];
  await Promise.all(
    candidatos.map(async (c) => {
      const anos = await getJson<{ codigo: string; nome: string }[]>(
        `/carros/marcas/${marca.codigo}/modelos/${c.codigo}/anos`,
      );
      const doAno = (anos ?? []).filter((a) => a.codigo.startsWith(`${e.anoModelo}-`));
      const ano = doAno.find((a) => a.codigo.endsWith(`-${sufixo}`)) ?? doAno[0];
      if (!ano) return;
      const v = await getJson<Record<string, unknown>>(
        `/carros/marcas/${marca.codigo}/modelos/${c.codigo}/anos/${ano.codigo}`,
      );
      const price = valorBrl(v?.Valor);
      if (!v || !price) return;
      opcoes.push({
        modelo: String(v.Modelo || c.nome),
        price,
        codigoFipe: typeof v.CodigoFipe === "string" ? v.CodigoFipe : null,
        mesReferencia: typeof v.MesReferencia === "string" ? v.MesReferencia.trim() : null,
        score: c.score,
      });
    }),
  );
  opcoes.sort((a, b) => b.score - a.score || a.modelo.length - b.modelo.length);
  return opcoes.map(({ modelo, price, codigoFipe, mesReferencia }) => ({ modelo, price, codigoFipe, mesReferencia }));
}
