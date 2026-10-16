import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { erroDaIa } from "@/lib/ai-errors";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";
import { TIPOS_DOC_COMPRA, type TipoDocCompra } from "@/lib/documentos-compra";

/**
 * Qual documento da compra é este arquivo? Só quando o texto do PDF não diz
 * sozinho (foto, PDF escaneado, PDF com texto que o leitor simples não abre,
 * como o DANFE gerado pelo SAP). Pergunta curta, resposta de uma palavra.
 *
 * Mesmo molde de `src/lib/crlv-ai.ts`.
 */

const schema = z.object({ tipo: z.string() });

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tipo"],
  properties: {
    tipo: {
      type: "string",
      description:
        "exatamente um de: CRLV (Certificado de Registro e Licenciamento), ATPV (Autorização para Transferência de Propriedade de Veículo / ATPV-e / CRV), NFE (DANFE / nota fiscal eletrônica de venda do veículo), PAGAMENTO (boleto, QR Code / Pix, instrução de pagamento), CONTRATO (contrato ou recibo de compra e venda do veículo), OUTRO",
    },
  },
} as const;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

export async function classificarDocCompra(base64: string, mimeType: string): Promise<TipoDocCompra> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura dos documentos requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }
  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(mimeType)) return "OUTRO";

  const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data: base64 } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 200,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system:
        "Você identifica documentos da compra de um veículo por uma loja de seminovos. " +
        "Olhe o título e o conteúdo do documento e responda só o tipo pedido.",
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Que documento é este?" }] }],
    });
  } catch (e) {
    throw erroDaIa(e);
  }
  await recordAiUsage({ feature: "documentosCompra", provider: config.provider, model: "claude-opus-5", usage: response.usage });

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const tipo = schema.parse(JSON.parse(text)).tipo.toUpperCase().trim();
    return (TIPOS_DOC_COMPRA as readonly string[]).includes(tipo) ? (tipo as TipoDocCompra) : "OUTRO";
  } catch {
    return "OUTRO";
  }
}
