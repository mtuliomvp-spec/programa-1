import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Taxa média de juros por instituição, publicada pelo BANCO CENTRAL.
 *
 * Fonte: API aberta Olinda (sem chave), conjunto "Taxas de juros de operações
 * de crédito por instituição financeira". Serve como REFERÊNCIA quando a loja
 * ainda não cadastrou a taxa que ela mesma negociou — a taxa da loja sempre
 * tem prioridade (ver src/lib/financing-rates.ts).
 *
 * Três cuidados, porque isto é rede externa numa tela pública:
 *  - timeout curto e nenhuma exceção vazando: falhou, fica o que já estava;
 *  - no máximo uma busca por dia (o BC publica médias de 5 dias);
 *  - o valor buscado é gravado no banco, então a vitrine lê do banco e nunca
 *    espera pela internet.
 */

const OLINDA =
  "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosDiariaPorInicioPeriodo";

/** Modalidade do BC para financiamento de carro por pessoa física. */
export const MODALIDADE_VEICULOS = "AQUISIÇÃO DE VEÍCULOS - PRÉ-FIXADO";
export const SEGMENTO_PF = "PESSOA FÍSICA";

const TIMEOUT_MS = 8000;
/** A busca AUTOMÁTICA (ao abrir a tela) espera bem menos que a manual. */
const TIMEOUT_AUTOMATICO_MS = 2500;
const UMA_VEZ_POR_DIA_MS = 24 * 60 * 60 * 1000;

export type BcbRate = {
  instituicao: string;
  taxaMensal: number;
  taxaAnual: number;
  inicioPeriodo: Date | null;
};

type OlindaRow = {
  InicioPeriodo?: string;
  FimPeriodo?: string;
  InstituicaoFinanceira?: string;
  Modalidade?: string;
  Segmento?: string;
  TaxaJurosAoMes?: number;
  TaxaJurosAoAno?: number;
};

/**
 * Busca no BC as taxas de aquisição de veículos (PF). Devolve lista vazia em
 * qualquer falha — quem chama nunca precisa de try/catch.
 */
export async function fetchBcbVehicleRates(
  timeoutMs = TIMEOUT_MS,
): Promise<{ rates: BcbRate[]; error: string | null }> {
  const url =
    `${OLINDA}?%24format=json&%24top=500&%24select=` +
    encodeURIComponent("InicioPeriodo,InstituicaoFinanceira,Modalidade,Segmento,TaxaJurosAoMes,TaxaJurosAoAno") +
    `&%24filter=` +
    encodeURIComponent(`Modalidade eq '${MODALIDADE_VEICULOS}' and Segmento eq '${SEGMENTO_PF}'`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!resp.ok) return { rates: [], error: `Banco Central respondeu ${resp.status}.` };
    const json = (await resp.json()) as { value?: OlindaRow[] };
    const linhas = json.value ?? [];
    const rates = linhas
      .filter((l) => l.InstituicaoFinanceira && typeof l.TaxaJurosAoMes === "number")
      .map((l) => ({
        instituicao: (l.InstituicaoFinanceira as string).trim(),
        taxaMensal: l.TaxaJurosAoMes as number,
        taxaAnual: (l.TaxaJurosAoAno as number) ?? 0,
        inicioPeriodo: l.InicioPeriodo ? new Date(l.InicioPeriodo) : null,
      }));
    if (rates.length === 0) {
      return { rates: [], error: "O Banco Central não devolveu nenhuma linha para esta modalidade." };
    }
    return { rates, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { rates: [], error: msg.includes("abort") ? "Tempo esgotado ao falar com o Banco Central." : msg };
  } finally {
    clearTimeout(timer);
  }
}

export type BcbSyncResult = {
  atualizadas: number;
  semCorrespondencia: string[];
  error: string | null;
  /** Quantas instituições o BC devolveu (para diagnóstico na tela). */
  linhasRecebidas: number;
};

/**
 * Atualiza o cache das financeiras que têm o nome do BC preenchido.
 * Casa pelo nome exato (sem diferenciar maiúsculas/acentos de espaço extra).
 */
export async function syncBcbRates(timeoutMs = TIMEOUT_MS): Promise<BcbSyncResult> {
  const alvos = await prisma.financingRate.findMany({
    where: { bcbInstitution: { not: null } },
    select: { id: true, name: true, bcbInstitution: true },
  });
  if (alvos.length === 0) {
    return { atualizadas: 0, semCorrespondencia: [], error: null, linhasRecebidas: 0 };
  }

  const { rates, error } = await fetchBcbVehicleRates(timeoutMs);
  if (error) return { atualizadas: 0, semCorrespondencia: [], error, linhasRecebidas: rates.length };

  const chave = (s: string) => s.trim().toUpperCase();
  const porInstituicao = new Map<string, BcbRate>();
  for (const r of rates) {
    // Mantém a linha mais recente de cada instituição.
    const atual = porInstituicao.get(chave(r.instituicao));
    if (!atual || (r.inicioPeriodo?.getTime() ?? 0) > (atual.inicioPeriodo?.getTime() ?? 0)) {
      porInstituicao.set(chave(r.instituicao), r);
    }
  }

  const agora = new Date();
  const semCorrespondencia: string[] = [];
  let atualizadas = 0;
  for (const alvo of alvos) {
    const achado = porInstituicao.get(chave(alvo.bcbInstitution as string));
    if (!achado) {
      semCorrespondencia.push(alvo.name);
      continue;
    }
    await prisma.financingRate.update({
      where: { id: alvo.id },
      data: {
        bcbMonthlyRate: achado.taxaMensal,
        bcbYearlyRate: achado.taxaAnual,
        bcbReferenceDate: achado.inicioPeriodo,
        bcbFetchedAt: agora,
      },
    });
    atualizadas++;
  }

  return { atualizadas, semCorrespondencia, error: null, linhasRecebidas: rates.length };
}

/**
 * Versão para as telas: roda no máximo uma vez por dia e nunca lança. Chamada
 * na tela de administração — a vitrine só lê o que já está no banco, para não
 * depender da internet do Banco Central para carregar um anúncio.
 */
let ultimaTentativa = 0;
const ESPERA_APOS_FALHA_MS = 60 * 60 * 1000;

export async function syncBcbRatesThrottled(): Promise<void> {
  try {
    // Falhou agora há pouco (BC fora do ar, rede bloqueada)? Não insiste a cada
    // abertura de tela — senão cada visita pagaria o tempo de espera.
    if (Date.now() - ultimaTentativa < ESPERA_APOS_FALHA_MS) return;
    const maisRecente = await prisma.financingRate.findFirst({
      where: { bcbInstitution: { not: null } },
      orderBy: { bcbFetchedAt: "desc" },
      select: { bcbFetchedAt: true },
    });
    const ultima = maisRecente?.bcbFetchedAt?.getTime() ?? 0;
    if (Date.now() - ultima < UMA_VEZ_POR_DIA_MS) return;
    ultimaTentativa = Date.now();
    await syncBcbRates(TIMEOUT_AUTOMATICO_MS);
  } catch {
    // Referência é acessório: se falhar, as telas seguem com a taxa da loja.
  }
}

/** Nomes das instituições no BC, para o usuário achar o nome exato. */
export async function listBcbInstitutions(): Promise<string[]> {
  const { rates } = await fetchBcbVehicleRates();
  return [...new Set(rates.map((r) => r.instituicao))].sort();
}
