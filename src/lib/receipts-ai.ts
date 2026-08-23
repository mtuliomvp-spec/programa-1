import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura de um PDF de COMPROVANTES DE PAGAMENTO (lote do banco — um
 * comprovante por página) via IA — mesma chave do Parecer IA (Parâmetros).
 * Devolve, por página, valor/data/descrição para o sistema casar cada
 * comprovante com o título pago correspondente e anexá-lo automaticamente.
 *
 * Espelha `src/lib/contract-ai.ts` (mesmo modelo, esforço baixo, par zod +
 * JSON Schema, mesmo mapeamento de erros).
 */

const receiptSchema = z.object({
  pagina: z.number().int(),
  valor: z.number().nullable(),
  data: z.string().nullable(),
  descricao: z.string().nullable(),
});

const receiptsSchema = z.object({ comprovantes: z.array(receiptSchema) });

export type ComprovanteExtraido = z.infer<typeof receiptSchema>;

const RECEIPTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["comprovantes"],
  properties: {
    comprovantes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pagina", "valor", "data", "descricao"],
        properties: {
          pagina: { type: "integer", description: "número da página no PDF, começando em 1" },
          valor: {
            type: ["number", "null"],
            description: "valor TOTAL pago no comprovante, em reais, como número (ex. 1871.67)",
          },
          data: { type: ["string", "null"], description: "data do pagamento no formato AAAA-MM-DD" },
          descricao: {
            type: ["string", "null"],
            description: "resumo curto do que foi pago (convênio/beneficiário/tributo)",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê um PDF com COMPROVANTES DE PAGAMENTO bancários (normalmente um comprovante por página; " +
  "uma página pode ter mais de um). Para CADA comprovante, devolva: a página em que ele está, o " +
  "VALOR TOTAL pago (número, ponto decimal), a DATA do pagamento (AAAA-MM-DD) e uma descrição curta " +
  "(convênio, beneficiário ou tributo — ex.: 'SEFAZ MA - IPVA', 'Pagamento de título — Fulano'). " +
  "Regras: 1) O valor é o total efetivamente pago no comprovante. 2) Não invente: campo ilegível vai " +
  "null. 3) Páginas que não são comprovantes (capa, índice) ficam de fora. 4) Responda somente com o JSON pedido.";

export async function extractPaymentReceipts(base64: string): Promise<ComprovanteExtraido[]> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura de comprovantes requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RECEIPTS_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Liste os comprovantes de pagamento deste PDF." },
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
      const detalhe = (e.message || "").replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(
        `A IA recusou o pedido (${e.status})${detalhe ? `: ${detalhe}` : "."} Tente novamente.`,
      );
    }
    throw e;
  }

  // Contador de uso de IA da instalação (não interfere no resultado).
  await recordAiUsage({
    feature: "comprovantes",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Anexe os comprovantes manualmente nos títulos.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os comprovantes no formato esperado. Tente novamente.");
  }
  const result = receiptsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os comprovantes no formato esperado. Tente novamente.");
  }
  return result.data.comprovantes;
}
