import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { getPatrimonialStats } from "@/lib/patrimonial";
import { getProfitLossStatement, getVehicleProfitReport, getStockAging } from "@/lib/reports";

/**
 * Parecer IA — análise técnica automatizada adaptada à revenda de veículos.
 * A IA recebe os indicadores da loja e devolve um parecer ESTRUTURADO (via tool
 * calling forçado), nunca texto livre. Dois modos: geral (gestão) e por veículo.
 * A chave da IA fica nos Parâmetros; sem chave, o recurso avisa que não está
 * configurado. Nada aqui altera a contabilidade — é só leitura.
 */

export type ParecerConfig = {
  provider: "ANTHROPIC" | "OPENAI";
  apiKey: string | null;
  model: string;
  configured: boolean;
};

const DEFAULT_MODEL: Record<string, string> = {
  // Claude Haiku 3.5 foi desativado pela Anthropic (404) — Haiku 4.5 é o
  // substituto direto (rápido e barato, ideal para o parecer).
  ANTHROPIC: "claude-haiku-4-5",
  OPENAI: "gpt-4o-mini",
};

export async function getParecerConfig(): Promise<ParecerConfig> {
  const c = await prisma.companySettings.findUnique({
    where: { id: "company" },
    select: { aiProvider: true, aiApiKey: true, aiModel: true },
  });
  const provider = c?.aiProvider === "OPENAI" ? "OPENAI" : "ANTHROPIC";
  const apiKey = c?.aiApiKey?.trim() || null;
  const model = (c?.aiModel?.trim() || DEFAULT_MODEL[provider]) as string;
  return { provider, apiKey, model, configured: !!apiKey };
}

export type Risco = { descricao: string; severidade: "baixa" | "media" | "alta" };

export type GlobalParecer = {
  resumo_executivo: string;
  analise_financeira: string;
  analise_estoque: string;
  analise_vendas: string;
  analise_caixa: string;
  riscos: Risco[];
  recomendacoes: string[];
  conclusao: "saudavel" | "atencao" | "critico";
};

export type VehicleParecer = {
  resumo_executivo: string;
  analise_precificacao: string;
  analise_estoque: string;
  riscos: Risco[];
  recomendacoes: string[];
  conclusao: "manter" | "revisar_preco" | "priorizar_venda";
};

export type ParecerMeta = { geradoEm: string; hash: string; empresa: string; modelo: string };

const riscoSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      descricao: { type: "string" },
      severidade: { type: "string", enum: ["baixa", "media", "alta"] },
    },
    required: ["descricao", "severidade"],
  },
} as const;

const GLOBAL_TOOL = {
  name: "emitir_parecer",
  description: "Emite o parecer técnico da gestão da revenda com todas as seções.",
  schema: {
    type: "object",
    properties: {
      resumo_executivo: { type: "string" },
      analise_financeira: { type: "string" },
      analise_estoque: { type: "string" },
      analise_vendas: { type: "string" },
      analise_caixa: { type: "string" },
      riscos: riscoSchema,
      recomendacoes: { type: "array", items: { type: "string" } },
      conclusao: { type: "string", enum: ["saudavel", "atencao", "critico"] },
    },
    required: [
      "resumo_executivo",
      "analise_financeira",
      "analise_estoque",
      "analise_vendas",
      "analise_caixa",
      "riscos",
      "recomendacoes",
      "conclusao",
    ],
  },
};

const VEHICLE_TOOL = {
  name: "emitir_parecer",
  description: "Emite o parecer técnico de um veículo específico com todas as seções.",
  schema: {
    type: "object",
    properties: {
      resumo_executivo: { type: "string" },
      analise_precificacao: { type: "string" },
      analise_estoque: { type: "string" },
      riscos: riscoSchema,
      recomendacoes: { type: "array", items: { type: "string" } },
      conclusao: { type: "string", enum: ["manter", "revisar_preco", "priorizar_venda"] },
    },
    required: [
      "resumo_executivo",
      "analise_precificacao",
      "analise_estoque",
      "riscos",
      "recomendacoes",
      "conclusao",
    ],
  },
};

const SYSTEM_PROMPT =
  "Você é um consultor de gestão e finanças sênior especializado em REVENDAS de veículos seminovos no Brasil. " +
  "Elabore um parecer técnico objetivo, formal e em PORTUGUÊS BRASILEIRO, com base em boas práticas de gestão " +
  "(margem, giro de estoque, capital de giro, fluxo de caixa, inadimplência). " +
  "Você DEVE chamar a função 'emitir_parecer' preenchendo TODAS as seções. Seja conservador e objetivo: " +
  "baseie-se SOMENTE nos números fornecidos, nunca invente valores. Aponte lacunas de dados como ressalva ou risco. " +
  "As recomendações devem ser práticas e acionáveis para o dono da loja.";

/** Chama a IA com saída estruturada forçada (tool calling). Devolve o objeto. */
async function callLLM(
  config: ParecerConfig,
  userText: string,
  tool: { name: string; description: string; schema: object },
): Promise<Record<string, unknown>> {
  if (!config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  const timeout = AbortSignal.timeout(60000);

  if (config.provider === "OPENAI") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      signal: timeout,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.schema } }],
        tool_choice: { type: "function", function: { name: tool.name } },
      }),
    });
    if (res.status === 401) throw new Error("Chave de IA inválida. Confira nos Parâmetros.");
    if (res.status === 429) throw new Error("Limite de uso da IA excedido. Aguarde alguns minutos.");
    if (!res.ok) throw new Error(`A IA respondeu com erro (${res.status}). Tente novamente.`);
    const json = (await res.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("A IA não retornou um parecer estruturado. Tente novamente.");
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      throw new Error("A IA retornou um parecer inválido. Tente novamente.");
    }
  }

  // Anthropic (padrão)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    signal: timeout,
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });
  if (res.status === 401) throw new Error("Chave de IA inválida. Confira nos Parâmetros.");
  if (res.status === 429) throw new Error("Limite de uso da IA excedido. Aguarde alguns minutos.");
  if (!res.ok) throw new Error(`A IA respondeu com erro (${res.status}). Tente novamente.`);
  const json = (await res.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
  const toolUse = json.content?.find((c) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("A IA não retornou um parecer estruturado. Tente novamente.");
  return toolUse.input;
}

function shortHash(payload: unknown, geradoEm: string): string {
  return createHash("sha256").update(JSON.stringify(payload) + geradoEm).digest("hex").slice(0, 16);
}

/** Parecer geral da gestão (indicadores dos últimos 12 meses + patrimônio). */
export async function generateGlobalParecer(
  config: ParecerConfig,
): Promise<{ parecer: GlobalParecer; meta: ParecerMeta }> {
  const [company, pat, pl, profit, aging] = await Promise.all([
    getCompany(),
    getPatrimonialStats(),
    getProfitLossStatement(12),
    getVehicleProfitReport(),
    getStockAging(),
  ]);

  const vendidos = profit.length;
  const receita = profit.reduce((s, r) => s + r.saleAmount, 0);
  const lucroLiquidoVendas = profit.reduce((s, r) => s + r.netProfit, 0);
  const margemMedia = receita > 0 ? (lucroLiquidoVendas / receita) * 100 : 0;
  const diasMedio = vendidos > 0 ? Math.round(profit.reduce((s, r) => s + r.daysInStock, 0) / vendidos) : 0;
  const estoqueParado = aging.vehicles.filter((v) => v.daysInStock >= 90).length;

  const payload = {
    empresa: company.nomeFantasia,
    patrimonio: {
      lucro_prejuizo_acumulado: pat.lucro,
      saldo_caixa: pat.saldoCaixa,
      estoque_veiculos_pago: pat.estoqueVeiculosPago,
      contas_a_receber: pat.contasAReceber,
      contas_a_pagar: pat.contasAPagar,
      titulos_vencidos_qtd: pat.titulosVencidosCount,
      titulos_vencidos_valor: pat.titulosVencidosValor,
      comissoes_a_pagar: pat.comissoesAPagar,
      capital_socios: pat.saldoCapital,
    },
    resultado_12m: {
      receita_veiculos: pl.receitaTotal,
      lucro_bruto: pl.lucroBruto,
      despesas: pl.despesas,
      comissoes: pl.comissoes,
      lucro_liquido: pl.lucroLiquido,
      veiculos_vendidos: pl.veiculosVendidos,
    },
    vendas: {
      qtd_vendidos: vendidos,
      receita_total: receita,
      lucro_liquido_vendas: lucroLiquidoVendas,
      margem_media_pct: Math.round(margemMedia * 10) / 10,
      dias_medio_ate_vender: diasMedio,
    },
    estoque: {
      veiculos_em_estoque: aging.vehicles.length,
      investido_em_estoque: aging.vehicles.reduce((s, v) => s + v.invested, 0),
      valor_de_venda_estoque: aging.vehicles.reduce((s, v) => s + v.salePrice, 0),
      parados_90_dias_ou_mais: estoqueParado,
    },
  };

  const userText =
    "Analise a gestão desta revenda de veículos com base nos indicadores JSON abaixo (valores em reais). " +
    "Emita o parecer geral. Todos os valores já estão calculados pelo sistema.\n\n" +
    JSON.stringify(payload, null, 2);

  const raw = await callLLM(config, userText, GLOBAL_TOOL);
  const parecer = normalizeGlobal(raw);
  const geradoEm = new Date().toISOString();
  return {
    parecer,
    meta: { geradoEm, hash: shortHash(parecer, geradoEm), empresa: company.nomeFantasia, modelo: config.model },
  };
}

/** Parecer de um veículo específico (precificação, giro, risco). */
export async function generateVehicleParecer(
  config: ParecerConfig,
  vehicleId: string,
): Promise<{ parecer: VehicleParecer; meta: ParecerMeta; vehicleLabel: string; plate: string }> {
  const [company, vehicle] = await Promise.all([
    getCompany(),
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { costs: true, sale: { select: { totalAmount: true, saleDate: true } } },
    }),
  ]);
  if (!vehicle) throw new Error("Veículo não encontrado.");

  const custosExtra = vehicle.costs.reduce((s, c) => s + c.amount, 0);
  const custoTotal = vehicle.purchasePrice + custosExtra;
  const diasEstoque = Math.max(
    0,
    Math.round((Date.now() - new Date(vehicle.entryDate).getTime()) / 86_400_000),
  );

  const payload = {
    veiculo: {
      marca: vehicle.brand,
      modelo: vehicle.model,
      versao: vehicle.version,
      ano_fab: vehicle.manufactureYear,
      ano_modelo: vehicle.modelYear,
      km: vehicle.km,
      cor: vehicle.color,
      status: vehicle.status,
    },
    financeiro: {
      preco_compra: vehicle.purchasePrice,
      custos_extras: custosExtra,
      custo_total: custoTotal,
      preco_de_venda_anunciado: vehicle.salePrice,
      margem_estimada: vehicle.salePrice - custoTotal,
      margem_estimada_pct:
        vehicle.salePrice > 0 ? Math.round(((vehicle.salePrice - custoTotal) / vehicle.salePrice) * 1000) / 10 : 0,
      vendido_por: vehicle.sale?.totalAmount ?? null,
    },
    tempo_em_estoque_dias: diasEstoque,
  };

  const userText =
    "Analise a situação deste veículo da revenda com base no JSON abaixo (valores em reais). " +
    "Avalie precificação (margem), tempo em estoque e riscos, e recomende ação. Emita o parecer do veículo.\n\n" +
    JSON.stringify(payload, null, 2);

  const raw = await callLLM(config, userText, VEHICLE_TOOL);
  const parecer = normalizeVehicle(raw);
  const geradoEm = new Date().toISOString();
  return {
    parecer,
    meta: { geradoEm, hash: shortHash(parecer, geradoEm), empresa: company.nomeFantasia, modelo: config.model },
    vehicleLabel: `${vehicle.brand} ${vehicle.model}`,
    plate: vehicle.plate,
  };
}

// --- normalização defensiva (garante os campos mesmo se a IA variar) ---
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function riscoList(v: unknown): Risco[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => {
      const o = r as Record<string, unknown>;
      const sev = o.severidade === "alta" || o.severidade === "media" ? o.severidade : "baixa";
      return { descricao: str(o.descricao), severidade: sev as Risco["severidade"] };
    })
    .filter((r) => r.descricao);
}
function normalizeGlobal(raw: Record<string, unknown>): GlobalParecer {
  const c = raw.conclusao;
  return {
    resumo_executivo: str(raw.resumo_executivo),
    analise_financeira: str(raw.analise_financeira),
    analise_estoque: str(raw.analise_estoque),
    analise_vendas: str(raw.analise_vendas),
    analise_caixa: str(raw.analise_caixa),
    riscos: riscoList(raw.riscos),
    recomendacoes: strList(raw.recomendacoes),
    conclusao: c === "critico" || c === "atencao" ? c : "saudavel",
  };
}
function normalizeVehicle(raw: Record<string, unknown>): VehicleParecer {
  const c = raw.conclusao;
  return {
    resumo_executivo: str(raw.resumo_executivo),
    analise_precificacao: str(raw.analise_precificacao),
    analise_estoque: str(raw.analise_estoque),
    riscos: riscoList(raw.riscos),
    recomendacoes: strList(raw.recomendacoes),
    conclusao: c === "revisar_preco" || c === "priorizar_venda" ? c : "manter",
  };
}
