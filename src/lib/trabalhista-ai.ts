import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { erroDaIa } from "@/lib/ai-errors";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura por IA de documento trabalhista emitido pela contabilidade: RECIBO
 * (ou aviso) DE FÉRIAS ou TERMO DE RESCISÃO (TRCT). Preenche o formulário da
 * ficha do funcionário — o usuário confere antes de salvar.
 *
 * Mesmo molde de src/lib/duplicatas-ai.ts (par zod + JSON Schema, esforço baixo).
 */

const docSchema = z.object({
  tipo: z.enum(["FERIAS", "RESCISAO", "OUTRO"]),
  funcionarioNome: z.string().nullable(),
  admissao: z.string().nullable(),
  aquisitivoInicio: z.string().nullable(),
  aquisitivoFim: z.string().nullable(),
  gozoInicio: z.string().nullable(),
  gozoFim: z.string().nullable(),
  diasGozo: z.number().int().nullable(),
  abonoDias: z.number().int().nullable(),
  totalProventos: z.number().nullable(),
  totalDescontos: z.number().nullable(),
  liquido: z.number().nullable(),
  dataAviso: z.string().nullable(),
  dataDesligamento: z.string().nullable(),
  // Texto livre (o esquema de saída não usa lista com nulo); normalizado abaixo.
  causaRescisao: z.string().nullable(),
  avisoPrevio: z.string().nullable(),
  multaFgts: z.number().nullable(),
});

export type DocumentoTrabalhista = Omit<z.infer<typeof docSchema>, "causaRescisao" | "avisoPrevio"> & {
  causaRescisao: "SEM_JUSTA_CAUSA" | "PEDIDO_DEMISSAO" | "JUSTA_CAUSA" | "ACORDO" | "FIM_CONTRATO" | null;
  avisoPrevio: "TRABALHADO" | "INDENIZADO" | "DISPENSADO" | "NAO_SE_APLICA" | null;
};

const CAUSAS = ["SEM_JUSTA_CAUSA", "PEDIDO_DEMISSAO", "JUSTA_CAUSA", "ACORDO", "FIM_CONTRATO"] as const;
const AVISOS = ["TRABALHADO", "INDENIZADO", "DISPENSADO", "NAO_SE_APLICA"] as const;
const umDe = <T extends string>(lista: readonly T[], v: string | null): T | null =>
  lista.find((x) => x === v?.trim().toUpperCase()) ?? null;

const data = (descricao: string) => ({ type: ["string", "null"], description: `${descricao}, AAAA-MM-DD` });
const num = (descricao: string) => ({ type: ["number", "null"], description: descricao });

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(docSchema.shape),
  properties: {
    tipo: { type: "string", enum: ["FERIAS", "RESCISAO", "OUTRO"], description: "recibo/aviso de férias, TRCT ou outro" },
    funcionarioNome: { type: ["string", "null"], description: "nome do empregado" },
    admissao: data("data de admissão"),
    aquisitivoInicio: data("início do período aquisitivo das férias"),
    aquisitivoFim: data("fim do período aquisitivo das férias"),
    gozoInicio: data("primeiro dia do gozo das férias"),
    gozoFim: data("último dia do gozo das férias"),
    diasGozo: { type: ["integer", "null"], description: "dias de gozo (descanso)" },
    abonoDias: { type: ["integer", "null"], description: "dias vendidos (abono pecuniário); 0 se não houver" },
    totalProventos: num("total de proventos/adicionais (bruto)"),
    totalDescontos: num("total de descontos (INSS, IRRF...)"),
    liquido: num("valor líquido a pagar ao empregado"),
    dataAviso: data("data do aviso (de férias ou de rescisão)"),
    dataDesligamento: data("data de afastamento/desligamento (só rescisão)"),
    causaRescisao: {
      type: ["string", "null"],
      description:
        "causa do afastamento no TRCT, uma de: SEM_JUSTA_CAUSA, PEDIDO_DEMISSAO, JUSTA_CAUSA, ACORDO, FIM_CONTRATO; null em férias",
    },
    avisoPrevio: {
      type: ["string", "null"],
      description: "aviso prévio no TRCT, um de: TRABALHADO, INDENIZADO, DISPENSADO, NAO_SE_APLICA; null em férias",
    },
    multaFgts: num("multa rescisória do FGTS (40% ou 20%), se o documento trouxer"),
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê documentos trabalhistas brasileiros emitidos pela contabilidade: RECIBO ou AVISO DE FÉRIAS " +
  "e TERMO DE RESCISÃO DO CONTRATO DE TRABALHO (TRCT). Regras: 1) Datas em AAAA-MM-DD. 2) Valores como " +
  "número com ponto decimal. 3) Proventos = soma da coluna de adicionais/proventos; descontos = soma " +
  "dos descontos; líquido = o valor líquido do documento. 4) Em férias, o período aquisitivo e o de " +
  "gozo estão no quadro de períodos; abono pecuniário 0 quando não houver. 5) Não invente: o que não " +
  "estiver no documento vai null. 6) Responda somente com o JSON pedido.";

const IMAGENS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export async function lerDocumentoTrabalhista(base64: string, mimeType: string): Promise<DocumentoTrabalhista> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do documento requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }
  const pdf = mimeType === "application/pdf";
  if (!pdf && !(IMAGENS as readonly string[]).includes(mimeType)) {
    throw new Error("Formato não suportado. Envie o recibo em PDF, JPG, PNG ou WEBP.");
  }
  const arquivo: Anthropic.Beta.BetaContentBlockParam = pdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as (typeof IMAGENS)[number], data: base64 } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [arquivo, { type: "text", text: "Leia este documento trabalhista." }] }],
    });
  } catch (e) {
    throw erroDaIa(e);
  }
  await recordAiUsage({ feature: "trabalhista", provider: config.provider, model: "claude-opus-5", usage: response.usage });
  if (response.stop_reason === "refusal") throw new Error("A IA não pôde ler este arquivo. Preencha à mão.");
  const texto = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  }
  const r = docSchema.safeParse(bruto);
  if (!r.success) throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  return { ...r.data, causaRescisao: umDe(CAUSAS, r.data.causaRescisao), avisoPrevio: umDe(AVISOS, r.data.avisoPrevio) };
}
