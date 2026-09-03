import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Contador de uso de IA da instalação.
 *
 * Toda chamada aos leitores de documento (contrato, NF-e, comprovantes,
 * duplicatas, CRLV, ATPV-e, boleto, fatura) e ao Parecer registra aqui quantos tokens
 * consumiu e o custo estimado. Como a chave normalmente é da operadora do
 * sistema (uma chave atendendo várias lojas), é este contador que mostra quanto
 * cada instalação está gastando.
 *
 * Registrar NUNCA pode derrubar a importação: qualquer falha ao gravar é
 * engolida — o usuário não perde o trabalho por causa do contador.
 */

export const AI_FEATURES = {
  contrato: "Contrato de compra",
  nfe: "NF-e / DANFE",
  comprovantes: "Comprovantes de pagamento",
  duplicatas: "Relatório de duplicatas",
  crlv: "CRLV",
  atpv: "ATPV-e",
  boleto: "Boleto",
  fatura: "Fatura de cartão",
  orcamento: "Orçamento do despachante",
  parecer: "Parecer IA",
} as const;

export type AiFeature = keyof typeof AI_FEATURES;

export function featureLabel(key: string): string {
  return (AI_FEATURES as Record<string, string>)[key] ?? key;
}

/**
 * Preço por 1 milhão de tokens (US$), tabela pública do provedor. Serve para
 * ESTIMAR o custo — a cobrança real é a da fatura do provedor. Modelo fora da
 * tabela entra com custo zero (os tokens continuam contados).
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export type TokenUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Custo estimado em dólares. Token lido do cache custa ~10% do preço de entrada
 * e token gravado no cache ~125% — proporções da tabela do provedor.
 */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const total =
    (input * price.input +
      output * price.output +
      cacheRead * price.input * 0.1 +
      cacheWrite * price.input * 1.25) /
    1_000_000;
  return Math.round(total * 1_000_000) / 1_000_000;
}

/** Grava uma chamada de IA. Nunca lança — falha de registro não quebra o fluxo. */
export async function recordAiUsage(entry: {
  feature: AiFeature;
  provider: string;
  model: string;
  usage?: TokenUsage | null;
  ok?: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const usage = entry.usage ?? {};
    // Quem disparou: útil para saber de onde vem o consumo. Opcional — se a
    // sessão não estiver disponível, o registro é gravado sem usuário.
    let userId: string | null = null;
    let userName: string | null = null;
    try {
      const { getSessionUser } = await import("@/lib/auth");
      const user = await getSessionUser();
      userId = user?.id ?? null;
      userName = user?.name ?? null;
    } catch {
      // sem sessão (ex.: rotina interna) — segue sem identificar
    }

    await prisma.aiUsage.create({
      data: {
        feature: entry.feature,
        provider: entry.provider,
        model: entry.model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        costUsd: estimateCostUsd(entry.model, usage),
        ok: entry.ok ?? true,
        errorMessage: entry.errorMessage?.slice(0, 300) || null,
        userId,
        userName,
      },
    });
  } catch (e) {
    console.error("Falha ao registrar o uso de IA (ignorada)", e);
  }
}

export type AiUsageTotals = {
  chamadas: number;
  erros: number;
  tokens: number;
  custoUsd: number;
};

export type AiUsageSummary = {
  mes: AiUsageTotals;
  total: AiUsageTotals;
  porFuncionalidade: (AiUsageTotals & { feature: string; label: string })[];
  porMes: (AiUsageTotals & { mes: string })[];
  ultimas: {
    id: string;
    feature: string;
    label: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    custoUsd: number;
    ok: boolean;
    errorMessage: string | null;
    userName: string | null;
    createdAt: Date;
  }[];
  desde: Date | null;
};

const zero = (): AiUsageTotals => ({ chamadas: 0, erros: 0, tokens: 0, custoUsd: 0 });

function soma(acc: AiUsageTotals, r: { ok: boolean; inputTokens: number; outputTokens: number; costUsd: number }) {
  acc.chamadas += 1;
  if (!r.ok) acc.erros += 1;
  acc.tokens += r.inputTokens + r.outputTokens;
  acc.custoUsd += r.costUsd;
  return acc;
}

/** Resumo do consumo para a tela de acompanhamento. */
export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const agora = new Date();
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));

  const [linhas, ultimas, primeira] = await Promise.all([
    prisma.aiUsage.findMany({
      select: { feature: true, ok: true, inputTokens: true, outputTokens: true, costUsd: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      // Teto de segurança: a tela resume, não audita linha a linha.
      take: 20000,
    }),
    prisma.aiUsage.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, feature: true, model: true, inputTokens: true, outputTokens: true,
        costUsd: true, ok: true, errorMessage: true, userName: true, createdAt: true,
      },
    }),
    prisma.aiUsage.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const mes = zero();
  const total = zero();
  const porFeature = new Map<string, AiUsageTotals>();
  const porMesMap = new Map<string, AiUsageTotals>();

  for (const r of linhas) {
    soma(total, r);
    if (r.createdAt >= inicioMes) soma(mes, r);
    const f = porFeature.get(r.feature) ?? zero();
    porFeature.set(r.feature, soma(f, r));
    const chave = `${r.createdAt.getUTCFullYear()}-${String(r.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = porMesMap.get(chave) ?? zero();
    porMesMap.set(chave, soma(m, r));
  }

  return {
    mes,
    total,
    porFuncionalidade: [...porFeature.entries()]
      .map(([feature, t]) => ({ feature, label: featureLabel(feature), ...t }))
      .sort((a, b) => b.custoUsd - a.custoUsd || b.chamadas - a.chamadas),
    porMes: [...porMesMap.entries()]
      .map(([mesKey, t]) => ({ mes: mesKey, ...t }))
      .sort((a, b) => (a.mes < b.mes ? 1 : -1))
      .slice(0, 12),
    ultimas: ultimas.map(({ costUsd, ...u }) => ({ ...u, custoUsd: costUsd, label: featureLabel(u.feature) })),
    desde: primeira?.createdAt ?? null,
  };
}
