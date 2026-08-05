import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";

/**
 * Extração de fatura de cartão de crédito em PDF via IA (Anthropic — mesma
 * chave do Parecer IA, cadastrada em Parâmetros). Devolve os lançamentos
 * prontos para virar CardInvoiceItem: compras internacionais já somadas com o
 * IOF da própria linha, pagamentos/créditos e linhas de valor zero ignorados.
 *
 * Usa o Claude Opus 5 fixo (não o modelo dos Parâmetros, calibrado para o
 * parecer): a transcrição precisa bater centavo a centavo. Um fallback
 * automático de servidor está habilitado — se o classificador de segurança
 * recusar a chamada, ela é reexecutada em outro modelo na mesma requisição.
 */

const itemSchema = z.object({
  data: z.string().describe("dd/mm da compra"),
  descricao: z.string(),
  parcela: z.string().nullable(),
  cartao_final: z.string().nullable(),
  portador: z.string().nullable(),
  valor: z.number(),
});

const faturaSchema = z.object({
  banco: z.string().nullable(),
  vencimento: z.string().nullable(),
  total_a_pagar: z.number(),
  lancamentos: z.array(itemSchema),
});

export type FaturaExtraida = z.infer<typeof faturaSchema>;
export type FaturaItem = z.infer<typeof itemSchema>;

// JSON Schema equivalente (structured outputs exige additionalProperties: false).
const FATURA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["banco", "vencimento", "total_a_pagar", "lancamentos"],
  properties: {
    banco: { type: ["string", "null"] },
    vencimento: { type: ["string", "null"], description: "dd/mm/aaaa" },
    total_a_pagar: { type: "number" },
    lancamentos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["data", "descricao", "parcela", "cartao_final", "portador", "valor"],
        properties: {
          data: { type: "string", description: "dd/mm da compra" },
          descricao: { type: "string" },
          parcela: { type: ["string", "null"], description: "x/y quando parcelado" },
          cartao_final: { type: ["string", "null"], description: "4 últimos dígitos do cartão" },
          portador: { type: ["string", "null"], description: "nome do portador do cartão" },
          valor: { type: "number", description: "valor em R$ (IOF da linha já somado)" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve faturas de cartão de crédito brasileiras para uso contábil. " +
  "Extraia TODOS os lançamentos de despesas e parcelamentos da fatura, de todos os cartões (titular e adicionais), exatamente como impressos. Regras: " +
  "1) Compras internacionais: some o IOF da própria linha ao valor da compra (uma linha só por compra, com o valor em R$). " +
  "2) IGNORE pagamentos, créditos, estornos recebidos (valores negativos, 'DEB AUTOM DE FATURA', 'PAGAMENTO') e linhas de valor 0,00 (ex.: anuidade zerada). " +
  "3) Para cada lançamento informe a data (dd/mm), a descrição como está na fatura, a parcela (x/y) quando houver, os 4 últimos dígitos do cartão e o primeiro nome do portador daquela seção. " +
  "4) A soma dos lançamentos deve bater com o total a pagar da fatura quando a fatura anterior foi quitada integralmente; confira antes de responder. " +
  "5) Nunca invente valores: transcreva. Responda somente com o JSON pedido.";

export async function extractFaturaFromPdf(pdfBase64: string): Promise<FaturaExtraida> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error(
      "A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.",
    );
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error(
      "A importação de fatura em PDF requer o provedor Anthropic (Parâmetros › Parecer IA).",
    );
  }

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Transcrição é tarefa mecânica: esforço baixo = resposta mais rápida e
      // barata, sem perda de fidelidade.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: FATURA_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: "Extraia os lançamentos desta fatura." },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      throw new Error("Chave de IA inválida. Confira nos Parâmetros.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error("Limite de uso da IA excedido. Aguarde alguns minutos e tente de novo.");
    }
    if (e instanceof Anthropic.APIError) {
      throw new Error(`A IA respondeu com erro (${e.status}). Tente novamente.`);
    }
    throw e;
  }

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde processar este arquivo. Tente novamente ou digite os lançamentos manualmente.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("A fatura é longa demais para uma leitura só. Tente novamente ou digite os lançamentos manualmente.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não retornou os lançamentos no formato esperado. Tente novamente.");
  }
  const result = faturaSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não retornou os lançamentos no formato esperado. Tente novamente.");
  }
  if (result.data.lancamentos.length === 0) {
    throw new Error("Nenhum lançamento encontrado no PDF — confira se é a fatura correta.");
  }
  return result.data;
}
