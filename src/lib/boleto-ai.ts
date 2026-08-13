import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";

/**
 * Leitura de BOLETO/GUIA de pagamento anexado ao veículo (PDF ou foto) via IA —
 * mesma chave do Parecer IA, mesmo molde de `src/lib/crlv-ai.ts`.
 *
 * Existe para casar a guia real (IPVA, multa, licenciamento, quitação de
 * financiamento) com os valores descontados na negociação: o valor lido
 * alimenta as regras de desconto/acréscimo já existentes (consignado → ajusta a
 * devolução ao proprietário; compra → guias × acordado vira custo de ajuste).
 */

const boletoSchema = z.object({
  valor: z.number().nullable(),
  vencimento: z.string().nullable(),
  tipo: z.enum(["QUITACAO", "IPVA", "LICENCIAMENTO", "MULTA", "TAXA", "OUTRO"]).nullable(),
  descricao: z.string().nullable(),
  cedente: z.string().nullable(),
});

export type BoletoExtraido = z.infer<typeof boletoSchema>;

const BOLETO_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["valor", "vencimento", "tipo", "descricao", "cedente"],
  properties: {
    valor: { type: ["number", "null"], description: "valor do documento em reais, ex. 1234.56" },
    vencimento: { type: ["string", "null"], description: "data de vencimento em yyyy-mm-dd" },
    tipo: {
      type: ["string", "null"],
      enum: ["QUITACAO", "IPVA", "LICENCIAMENTO", "MULTA", "TAXA", "OUTRO", null],
      description:
        "QUITACAO = boleto de quitação de financiamento de veículo (banco/financeira); IPVA/LICENCIAMENTO/MULTA/TAXA = guias de órgãos; OUTRO = qualquer outro",
    },
    descricao: {
      type: ["string", "null"],
      description: "descrição curta do que o boleto cobra, ex. 'IPVA 2026 cota única'",
    },
    cedente: { type: ["string", "null"], description: "beneficiário/cedente do boleto" },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve boletos e guias de pagamento brasileiros (IPVA, licenciamento, multas, taxas, " +
  "quitação de financiamento de veículo). Leia o documento e devolva os campos pedidos. Regras: " +
  "1) VALOR: o valor do documento (total a pagar), número em reais com ponto decimal. " +
  "2) VENCIMENTO: a data de vencimento no formato yyyy-mm-dd. " +
  "3) TIPO: QUITACAO quando for boleto de quitação/liquidação de financiamento emitido por " +
  "banco/financeira; IPVA, LICENCIAMENTO, MULTA ou TAXA para guias de órgãos; OUTRO nos demais. " +
  "4) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "5) Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

export async function extractBoleto(base64: string, mimeType: string): Promise<BoletoExtraido> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura de boletos requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error(
      "Formato não suportado para leitura automática. Anexe o boleto em PDF, JPG, PNG ou WEBP.",
    );
  }

  const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data: base64 } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: BOLETO_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Transcreva este boleto/guia." }] },
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

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Confira os valores à mão.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os dados do boleto no formato esperado. Tente novamente.");
  }
  const result = boletoSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados do boleto no formato esperado. Tente novamente.");
  }
  return result.data;
}
