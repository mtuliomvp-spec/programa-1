import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura da ATPV-e anexada (PDF ou foto) via IA — mesmo molde de
 * `src/lib/crlv-ai.ts`, mesma chave do Parecer IA.
 *
 * A ATPV-e é o documento mais completo da compra de um usado: além de chassi e
 * RENAVAM, é a ÚNICA fonte do NÚMERO DO CRV e do CÓDIGO DE SEGURANÇA, que o
 * Renave exige na saída (art. 18, II) e que não vêm de consulta por placa nem
 * do CRLV. Traz também o hodômetro e o valor declarado da venda, que servem de
 * conferência contra o que foi digitado na ficha.
 */

const atpvSchema = z.object({
  placa: z.string().nullable(),
  renavam: z.string().nullable(),
  chassi: z.string().nullable(),
  numeroCrv: z.string().nullable(),
  codigoSegurancaCrv: z.string().nullable(),
  numeroAtpv: z.string().nullable(),
  hodometro: z.number().int().nullable(),
  valorDeclarado: z.number().nullable(),
  dataVenda: z.string().nullable(),
  vendedorNome: z.string().nullable(),
  vendedorDocumento: z.string().nullable(),
  compradorNome: z.string().nullable(),
  compradorDocumento: z.string().nullable(),
});

export type AtpvExtraido = z.infer<typeof atpvSchema>;

const ATPV_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "placa",
    "renavam",
    "chassi",
    "numeroCrv",
    "codigoSegurancaCrv",
    "numeroAtpv",
    "hodometro",
    "valorDeclarado",
    "dataVenda",
    "vendedorNome",
    "vendedorDocumento",
    "compradorNome",
    "compradorDocumento",
  ],
  properties: {
    placa: { type: ["string", "null"], description: "só letras e números, ex. ABC1D23" },
    renavam: { type: ["string", "null"], description: "campo CÓDIGO RENAVAM, só dígitos" },
    chassi: { type: ["string", "null"], description: "os 17 caracteres do VIN, sem espaços" },
    numeroCrv: { type: ["string", "null"], description: "campo NÚMERO CRV, só dígitos" },
    codigoSegurancaCrv: {
      type: ["string", "null"],
      description:
        "campo CÓDIGO DE SEGURANÇA CRV, só dígitos. Se vier mascarado (ex.: '***'), devolva null",
    },
    numeroAtpv: { type: ["string", "null"], description: "campo NÚMERO ATPVe, só dígitos" },
    hodometro: { type: ["integer", "null"], description: "quilometragem do campo HODÔMETRO" },
    valorDeclarado: {
      type: ["number", "null"],
      description: "valor declarado na venda, em reais com ponto decimal",
    },
    dataVenda: {
      type: ["string", "null"],
      description: "DATA DECLARADA DA VENDA em yyyy-mm-dd (não é a data de emissão do CRV)",
    },
    vendedorNome: { type: ["string", "null"] },
    vendedorDocumento: { type: ["string", "null"], description: "CPF/CNPJ do vendedor, só dígitos" },
    compradorNome: { type: ["string", "null"] },
    compradorDocumento: { type: ["string", "null"], description: "CPF/CNPJ do comprador, só dígitos" },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve a ATPV-e brasileira (Autorização para Transferência de Propriedade de Veículo, " +
  "digital), emitida pelo SENATRAN. Leia o documento e devolva os campos pedidos exatamente como " +
  "impressos. Regras: " +
  "1) O bloco do veículo tem campos com rótulo próprio: CÓDIGO RENAVAM, PLACA, CHASSI, NÚMERO CRV, " +
  "CÓDIGO DE SEGURANÇA CRV, NÚMERO ATPVe, DATA EMISSÃO DO CRV e HODÔMETRO. Case cada valor com o " +
  "SEU rótulo — não troque NÚMERO CRV por CÓDIGO DE SEGURANÇA nem por RENAVAM, mesmo quando os " +
  "números tiverem tamanhos parecidos. " +
  "2) CHASSI tem 17 caracteres (sem I, O ou Q). Se não conseguir ler os 17 com certeza, devolva " +
  "null — nunca complete nem adivinhe. " +
  "3) Números (RENAVAM, CRV, código de segurança, ATPVe): só dígitos, sem pontos ou traços. Campo " +
  "mascarado com asteriscos vale null. " +
  "4) DATAVENDA é a DATA DECLARADA DA VENDA, no bloco da autorização — NÃO é a DATA EMISSÃO DO CRV. " +
  "Se só houver a data de emissão do CRV, devolva null. " +
  "5) VENDEDOR é quem consta em IDENTIFICAÇÃO DO VENDEDOR; COMPRADOR, em IDENTIFICAÇÃO DO COMPRADOR. " +
  "6) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "7) Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

export async function extractAtpv(base64: string, mimeType: string): Promise<AtpvExtraido> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura da ATPV-e requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error(
      "Formato não suportado para leitura automática. Anexe a ATPV-e em PDF, JPG, PNG ou WEBP.",
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
        format: { type: "json_schema", schema: ATPV_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Transcreva esta ATPV-e." }] },
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

  await recordAiUsage({
    feature: "atpv",
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
    throw new Error("A IA não devolveu os dados da ATPV-e no formato esperado. Tente novamente.");
  }
  const result = atpvSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados da ATPV-e no formato esperado. Tente novamente.");
  }
  return result.data;
}
