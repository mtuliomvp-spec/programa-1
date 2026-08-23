import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura do CONTRATO DE COMPRA do veículo (PDF ou foto) via IA — mesma chave do
 * Parecer IA (Parâmetros). Extrai os dados do veículo e da compra para preencher
 * o cadastro em "Novo veículo", deixando só a conferência e o botão de finalizar.
 *
 * Espelha `src/lib/crlv-ai.ts` (mesmo modelo, esforço baixo, par zod + JSON
 * Schema, mesmo mapeamento de erros).
 */

const contractSchema = z.object({
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  versao: z.string().nullable(),
  anoFabricacao: z.number().int().nullable(),
  anoModelo: z.number().int().nullable(),
  placa: z.string().nullable(),
  chassi: z.string().nullable(),
  renavam: z.string().nullable(),
  cor: z.string().nullable(),
  combustivel: z.string().nullable(),
  transmissao: z.string().nullable(),
  km: z.number().int().nullable(),
  valorCompra: z.number().nullable(),
  vendedorNome: z.string().nullable(),
  vendedorDocumento: z.string().nullable(),
  dataCompra: z.string().nullable(),
});

export type ContratoExtraido = z.infer<typeof contractSchema>;

const CONTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "marca",
    "modelo",
    "versao",
    "anoFabricacao",
    "anoModelo",
    "placa",
    "chassi",
    "renavam",
    "cor",
    "combustivel",
    "transmissao",
    "km",
    "valorCompra",
    "vendedorNome",
    "vendedorDocumento",
    "dataCompra",
  ],
  properties: {
    marca: { type: ["string", "null"] },
    modelo: { type: ["string", "null"], description: "sem a marca" },
    versao: { type: ["string", "null"], description: "versão/acabamento, ex. 1.0 MT" },
    anoFabricacao: { type: ["integer", "null"] },
    anoModelo: { type: ["integer", "null"] },
    placa: { type: ["string", "null"], description: "só letras e números, ex. ABC1D23" },
    chassi: { type: ["string", "null"], description: "os 17 caracteres do VIN, sem espaços" },
    renavam: { type: ["string", "null"], description: "só dígitos" },
    cor: { type: ["string", "null"] },
    combustivel: { type: ["string", "null"] },
    transmissao: { type: ["string", "null"], description: "Manual ou Automático, se constar" },
    km: { type: ["integer", "null"], description: "quilometragem, só o número" },
    valorCompra: {
      type: ["number", "null"],
      description: "valor de compra/venda do veículo em reais, só o número (ex. 45000.00)",
    },
    vendedorNome: {
      type: ["string", "null"],
      description: "nome do VENDEDOR/proprietário que está vendendo o veículo à loja",
    },
    vendedorDocumento: { type: ["string", "null"], description: "CPF ou CNPJ do vendedor, só dígitos" },
    dataCompra: { type: ["string", "null"], description: "data do contrato no formato AAAA-MM-DD" },
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê um CONTRATO DE COMPRA E VENDA de veículo (a loja é a COMPRADORA) e " +
  "extrai os dados pedidos exatamente como constam. Regras: " +
  "1) CHASSI tem 17 caracteres (letras e números, sem I, O ou Q). Transcreva os 17, sem espaços. " +
  "Se não conseguir ler TODOS os 17 com certeza, devolva null — nunca complete nem adivinhe. " +
  "2) RENAVAM e documentos: só os dígitos. 3) PLACA: só letras e números. " +
  "4) VALORCOMPRA é o valor do veículo negociado (o quanto a loja paga pelo carro), como número. " +
  "5) VENDEDORNOME é quem está VENDENDO o carro para a loja (o proprietário/particular), não a loja. " +
  "6) DATACOMPRA no formato AAAA-MM-DD. " +
  "7) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "8) Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

export async function extractPurchaseContract(
  base64: string,
  mimeType: string,
): Promise<ContratoExtraido> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do contrato requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error(
      "Formato não suportado para leitura automática. Anexe o contrato em PDF, JPG, PNG ou WEBP.",
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
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: CONTRACT_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Extraia os dados deste contrato de compra do veículo." }] },
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
    feature: "contrato",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Preencha os dados à mão na ficha do veículo.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os dados do contrato no formato esperado. Tente novamente.");
  }
  const result = contractSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados do contrato no formato esperado. Tente novamente.");
  }
  return result.data;
}
