import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura do documento do veículo no financiamento de terceiros: CRLV (carro
 * usado) OU NOTA FISCAL de veículo 0 km (DANFE da montadora/concessionária).
 *
 * Os dois documentos dizem as mesmas duas coisas de que a operação precisa —
 * DE QUEM é o carro e QUAL é o carro —, só que em campos diferentes:
 *
 *  - CRLV: proprietário e CPF/CNPJ no corpo do documento; placa e RENAVAM já
 *    existem.
 *  - NF 0 km: o dono é o DESTINATÁRIO da nota (nome, CNPJ/CPF, endereço,
 *    telefone); o carro está nos "Dados do produto" (chassi, marca/modelo,
 *    ano fab./mod., cor, combustível). Placa e RENAVAM ainda NÃO existem.
 *
 * Mesma chave do Parecer IA e mesmo molde de `src/lib/crlv-ai.ts`.
 */

const docSchema = z.object({
  documento: z.string().nullable(),
  proprietario: z.string().nullable(),
  cpfCnpj: z.string().nullable(),
  telefone: z.string().nullable(),
  endereco: z.string().nullable(),
  placa: z.string().nullable(),
  renavam: z.string().nullable(),
  chassi: z.string().nullable(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  versao: z.string().nullable(),
  anoFabricacao: z.number().int().nullable(),
  anoModelo: z.number().int().nullable(),
  cor: z.string().nullable(),
  combustivel: z.string().nullable(),
  transmissao: z.string().nullable(),
  exercicio: z.string().nullable(),
  /** NF: número da nota (só para a descrição do anexo). */
  numeroNota: z.string().nullable(),
});

export type DocumentoVeiculo = z.infer<typeof docSchema>;
export type TipoDocumentoVeiculo = "CRLV" | "NF" | null;

const DOC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "documento",
    "proprietario",
    "cpfCnpj",
    "telefone",
    "endereco",
    "placa",
    "renavam",
    "chassi",
    "marca",
    "modelo",
    "versao",
    "anoFabricacao",
    "anoModelo",
    "cor",
    "combustivel",
    "transmissao",
    "exercicio",
    "numeroNota",
  ],
  properties: {
    documento: {
      type: ["string", "null"],
      description: "CRLV quando for Certificado de Registro e Licenciamento; NF quando for nota fiscal/DANFE de veículo 0 km; null se não for nenhum dos dois",
    },
    proprietario: {
      type: ["string", "null"],
      description: "dono do veículo: no CRLV, o campo PROPRIETÁRIO; na NF, o DESTINATÁRIO (nome/razão social)",
    },
    cpfCnpj: {
      type: ["string", "null"],
      description: "CPF/CNPJ do dono (destinatário na NF), só dígitos; null se mascarado/incompleto",
    },
    telefone: { type: ["string", "null"], description: "telefone do dono/destinatário, se constar" },
    endereco: {
      type: ["string", "null"],
      description: "endereço do dono/destinatário em uma linha: rua, número, complemento, bairro, cidade - UF, CEP (o que constar)",
    },
    placa: { type: ["string", "null"], description: "só letras e números; NF de 0 km NÃO tem placa: null" },
    renavam: { type: ["string", "null"], description: "só dígitos; na NF, null (o código Renavam do MODELO não é o RENAVAM do veículo)" },
    chassi: { type: ["string", "null"], description: "os 17 caracteres do VIN, sem espaços" },
    marca: { type: ["string", "null"], description: "só a marca, ex. VW, FIAT, HONDA" },
    modelo: { type: ["string", "null"], description: "modelo sem a marca, ex. VIRTUS, POLO TRACK" },
    versao: { type: ["string", "null"], description: "versão/acabamento quando constar, ex. CL AC, EXL CVT" },
    anoFabricacao: { type: ["integer", "null"] },
    anoModelo: { type: ["integer", "null"] },
    cor: { type: ["string", "null"], description: "descrição da cor, ex. BRANCO CRISTAL" },
    combustivel: { type: ["string", "null"], description: "ex. Álcool/Gasolina (sem o código numérico)" },
    transmissao: { type: ["string", "null"], description: "Manual ou Automático, se constar" },
    exercicio: { type: ["string", "null"], description: "CRLV: ano do exercício, 4 dígitos; NF: null" },
    numeroNota: { type: ["string", "null"], description: "NF: número da nota fiscal; CRLV: null" },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve documentos de veículo brasileiros: o CRLV (Certificado de Registro e Licenciamento) " +
  "ou a NOTA FISCAL/DANFE de veículo 0 km. Identifique qual é e devolva os campos pedidos. Regras: " +
  "1) DOCUMENTO: 'CRLV' ou 'NF'. " +
  "2) DONO do veículo: no CRLV é o campo PROPRIETÁRIO (nome e CPF/CNPJ). Na NF é o DESTINATÁRIO/REMETENTE — " +
  "NUNCA o emitente (montadora/concessionária) nem a transportadora. Traga também telefone e endereço do destinatário. " +
  "3) CHASSI tem 17 caracteres (sem I, O ou Q). Transcreva os 17, sem espaços nem separadores. Se não conseguir " +
  "ler TODOS os 17 com certeza, devolva null — nunca complete nem adivinhe caractere. " +
  "4) NF de 0 km NÃO tem placa nem RENAVAM: devolva null nos dois. Atenção: 'CÓD.RENAVAM' da NF é o código do " +
  "MODELO, não o RENAVAM do veículo — ignore. " +
  "5) MARCA/MODELO: na NF a descrição do produto costuma vir junta ('VW/VIRTUS CL AC') — separe em marca (VW), " +
  "modelo (VIRTUS) e versão (CL AC). " +
  "6) CPF/CNPJ: só os dígitos, e SOMENTE se estiver completo — mascarado com asteriscos vai null. " +
  "7) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "8) Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

/** Normaliza o que a IA devolveu em "documento" para o par conhecido. */
export function tipoDocumento(raw: string | null | undefined): TipoDocumentoVeiculo {
  const v = (raw || "").trim().toUpperCase();
  if (v.includes("CRLV")) return "CRLV";
  if (v.includes("NF") || v.includes("NOTA") || v.includes("DANFE")) return "NF";
  return null;
}

export async function extractVehicleDoc(base64: string, mimeType: string): Promise<DocumentoVeiculo> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do documento requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error("Formato não suportado para leitura automática. Anexe o documento em PDF, JPG, PNG ou WEBP.");
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
      output_config: { effort: "low", format: { type: "json_schema", schema: DOC_JSON_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Transcreva este documento do veículo." }] },
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
    feature: "crlv",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Preencha os dados à mão.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os dados do documento no formato esperado. Tente novamente.");
  }
  const result = docSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados do documento no formato esperado. Tente novamente.");
  }
  return result.data;
}
