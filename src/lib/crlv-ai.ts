import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura do CRLV anexado (PDF ou foto) via IA — mesma chave do Parecer IA,
 * cadastrada em Parâmetros.
 *
 * Existe porque a venda exige RENAVAM e chassi completo, e as duas outras
 * fontes não servem: a consulta por placa devolve o chassi MASCARADO
 * (`*****80388`) e não traz RENAVAM. O documento certo já está anexado na
 * ficha — só faltava lê-lo.
 *
 * Espelha `src/lib/fatura-ai.ts` (mesmo modelo, mesmo `effort: "low"`, mesmo
 * par zod + JSON Schema, mesmo mapeamento de erros). A diferença é aceitar
 * IMAGEM além de PDF: o CRLV costuma ser fotografado, e o bloco muda de
 * `document` para `image`.
 */

const crlvSchema = z.object({
  placa: z.string().nullable(),
  renavam: z.string().nullable(),
  chassi: z.string().nullable(),
  exercicio: z.string().nullable(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  anoFabricacao: z.number().int().nullable(),
  anoModelo: z.number().int().nullable(),
  cor: z.string().nullable(),
  combustivel: z.string().nullable(),
  transmissao: z.string().nullable(),
  proprietario: z.string().nullable(),
});

export type CrlvExtraido = z.infer<typeof crlvSchema>;

// structured outputs exige `additionalProperties: false` e todos os campos em
// `required` (nulo se não achar), por isso o schema vai duplicado aqui.
const CRLV_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "placa",
    "renavam",
    "chassi",
    "exercicio",
    "marca",
    "modelo",
    "anoFabricacao",
    "anoModelo",
    "cor",
    "combustivel",
    "transmissao",
    "proprietario",
  ],
  properties: {
    placa: { type: ["string", "null"], description: "só letras e números, ex. ABC1D23" },
    renavam: { type: ["string", "null"], description: "só dígitos" },
    chassi: { type: ["string", "null"], description: "os 17 caracteres do VIN, sem espaços" },
    exercicio: { type: ["string", "null"], description: "ano do exercício, 4 dígitos" },
    marca: { type: ["string", "null"] },
    modelo: { type: ["string", "null"], description: "sem a marca" },
    anoFabricacao: { type: ["integer", "null"] },
    anoModelo: { type: ["integer", "null"] },
    cor: { type: ["string", "null"] },
    combustivel: { type: ["string", "null"] },
    transmissao: { type: ["string", "null"], description: "Manual ou Automático, se constar" },
    proprietario: {
      type: ["string", "null"],
      description: "nome completo do PROPRIETÁRIO como impresso no documento",
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve o CRLV (Certificado de Registro e Licenciamento de Veículo) brasileiro. " +
  "Leia o documento e devolva os campos pedidos exatamente como impressos. Regras: " +
  "1) CHASSI tem 17 caracteres (letras e números, sem I, O ou Q). Transcreva os 17, sem espaços " +
  "nem separadores. Se não conseguir ler TODOS os 17 com certeza, devolva null — nunca complete " +
  "nem adivinhe caractere. " +
  "2) RENAVAM: só os dígitos, sem pontos ou traços. " +
  "3) PLACA: só letras e números (ABC1D23 ou ABC1234). " +
  "4) EXERCÍCIO é o ano de licenciamento do documento (costuma aparecer como 'EXERCÍCIO' no topo). " +
  "5) PROPRIETÁRIO: o nome completo impresso no campo de proprietário do documento (pessoa ou empresa). " +
  "6) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "7) Responda somente com o JSON pedido.";

/** Tipos de imagem que a API aceita no bloco `image`. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

/**
 * @param base64 conteúdo do arquivo
 * @param mimeType tipo do anexo (`application/pdf` ou uma imagem suportada)
 */
export async function extractCrlv(base64: string, mimeType: string): Promise<CrlvExtraido> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do CRLV requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error(
      "Formato não suportado para leitura automática. Anexe o CRLV em PDF, JPG, PNG ou WEBP.",
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
      // Transcrição é tarefa mecânica: esforço baixo basta e sai mais rápido.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: CRLV_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Transcreva este CRLV." }] },
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
      // Inclui o detalhe da API: sem ele, um 400 (pedido recusado) vira
      // adivinhação — o número sozinho não diz o que precisa ser corrigido.
      const detalhe = (e.message || "").replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(
        `A IA recusou o pedido (${e.status})${detalhe ? `: ${detalhe}` : "."} Tente novamente.`,
      );
    }
    throw e;
  }

  // Contador de uso de IA da instalação (não interfere no resultado).
  await recordAiUsage({
    feature: "crlv",
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
    throw new Error("A IA não devolveu os dados do CRLV no formato esperado. Tente novamente.");
  }
  const result = crlvSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados do CRLV no formato esperado. Tente novamente.");
  }
  return result.data;
}
