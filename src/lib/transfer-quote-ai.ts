import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura do ORÇAMENTO/RECIBO de transferência do despachante (foto ou PDF)
 * via IA — mesma chave do Parecer IA. Devolve quem emitiu (despachante),
 * cliente/revenda, veículo/placa, as linhas cobradas e o total, para o
 * sistema lançar o título no Contas a pagar sem digitação.
 *
 * Espelha `src/lib/crlv-ai.ts` (modelo fixo, esforço baixo, zod + JSON Schema,
 * mesmo mapeamento de erros; aceita PDF e imagem).
 */

const itemSchema = z.object({
  descricao: z.string(),
  valor: z.number(),
});

const quoteSchema = z.object({
  despachanteNome: z.string().nullable(),
  despachanteCnpj: z.string().nullable(),
  despachanteTelefone: z.string().nullable(),
  cliente: z.string().nullable(),
  revenda: z.string().nullable(),
  veiculo: z.string().nullable(),
  placa: z.string().nullable(),
  data: z.string().nullable(),
  itens: z.array(itemSchema),
  total: z.number().nullable(),
});

export type OrcamentoTransferencia = z.infer<typeof quoteSchema>;

const QUOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "despachanteNome",
    "despachanteCnpj",
    "despachanteTelefone",
    "cliente",
    "revenda",
    "veiculo",
    "placa",
    "data",
    "itens",
    "total",
  ],
  properties: {
    despachanteNome: { type: ["string", "null"], description: "nome/razão social do despachante que emitiu o recibo (cabeçalho)" },
    despachanteCnpj: { type: ["string", "null"], description: "CNPJ do despachante, só dígitos" },
    despachanteTelefone: { type: ["string", "null"], description: "primeiro telefone do cabeçalho" },
    cliente: { type: ["string", "null"], description: "o que está escrito no campo Cliente (à mão), ou null se vazio" },
    revenda: { type: ["string", "null"], description: "o que está escrito no campo Revenda, ou null" },
    veiculo: { type: ["string", "null"], description: "o que está escrito no campo Veículo" },
    placa: { type: ["string", "null"], description: "placa escrita no recibo, só letras e números" },
    data: { type: ["string", "null"], description: "data do recibo em DD/MM/AAAA (ano com 4 dígitos)" },
    itens: {
      type: "array",
      description: "só as linhas da tabela que têm valor escrito",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["descricao", "valor"],
        properties: {
          descricao: { type: "string", description: "nome da linha, ex. TRANSFERÊNCIA, SERVIÇO, TAXA DE VISTORIA" },
          valor: { type: "number", description: "valor em reais, com centavos" },
        },
      },
    },
    total: { type: ["number", "null"], description: "valor escrito na linha TOTAL, em reais" },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve recibos/orçamentos de despachante de veículos (transferência, emplacamento) brasileiros, " +
  "geralmente um formulário impresso preenchido À MÃO. Regras: " +
  "1) O cabeçalho impresso identifica o DESPACHANTE (nome, CNPJ, telefones). " +
  "2) Os campos Banco, Revenda, Cliente, Serviço, Veículo e Placa são preenchidos à mão: transcreva o que está escrito; vazio vai null. " +
  "3) A tabela tem uma linha por tipo de serviço (TRANSFERÊNCIA, REG. DE GRAVAME, SERVIÇO, MUDANÇA DE UF, TAXA DE VISTORIA etc.). " +
  "Devolva SOMENTE as linhas com valor escrito na coluna da direita, com o valor em reais. Valores manuscritos como '185,00', '185.00' ou '185oo' significam 185 reais. " +
  "4) TOTAL é o valor escrito na linha TOTAL. Confira: a soma das linhas deve bater com o total; se não bater, mantenha o que está escrito. " +
  "5) PLACA: só letras e números. DATA: DD/MM/AAAA, completando o ano com 4 dígitos (ex.: 05/09/26 → 05/09/2026). " +
  "6) Não invente nada: o que não conseguir ler vai null. Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

export async function extractTransferQuote(base64: string, mimeType: string): Promise<OrcamentoTransferencia> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do orçamento requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error("Formato não suportado para leitura automática. Anexe o orçamento em PDF, JPG, PNG ou WEBP.");
  }

  const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data: base64 } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: QUOTE_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Transcreva este recibo/orçamento do despachante." }] },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      throw new Error("Chave de IA inválida. Confira nos Parâmetros.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error("Limite de uso da IA excedido. Aguarde alguns minutos e tente de novo.");
    }
    if (e instanceof Anthropic.APIError && (Number(e.status) >= 500 || /overloaded/i.test(e.message || ""))) {
      throw new Error(
        "Os servidores da IA estão sobrecarregados neste momento — não é nada com o seu arquivo. Aguarde um minuto e tente de novo.",
      );
    }
    if (e instanceof Anthropic.APIError) {
      const detalhe = (e.message || "").replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(`A IA recusou o pedido (${e.status})${detalhe ? `: ${detalhe}` : "."} Tente novamente.`);
    }
    throw e;
  }

  await recordAiUsage({
    feature: "orcamento",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Lance o custo à mão na ficha do veículo.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os dados do orçamento no formato esperado. Tente novamente.");
  }
  const result = quoteSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados do orçamento no formato esperado. Tente novamente.");
  }
  return result.data;
}
