import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { erroDaIa } from "@/lib/ai-errors";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura por IA do HOLERITE (demonstrativo de pagamento de salário) que a
 * contabilidade manda — um PDF com o holerite de todos os funcionários,
 * normalmente com duas vias de cada. Devolve um item por funcionário, com o
 * líquido que vira o valor do salário na folha.
 *
 * Mesmo molde de src/lib/trabalhista-ai.ts.
 */

const itemSchema = z.object({
  nome: z.string(),
  cargo: z.string().nullable(),
  salarioBase: z.number().nullable(),
  totalVencimentos: z.number().nullable(),
  totalDescontos: z.number().nullable(),
  liquido: z.number(),
});

const holeriteSchema = z.object({
  competencia: z.string().nullable(),
  itens: z.array(itemSchema),
});

export type ItemHolerite = z.infer<typeof itemSchema>;
export type Holerite = { competencia: string | null; itens: ItemHolerite[] };

const num = (descricao: string) => ({ type: ["number", "null"], description: descricao });

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["competencia", "itens"],
  properties: {
    competencia: {
      type: ["string", "null"],
      description: "mês de referência dos holerites no formato MM/AAAA (ex.: período 01/10/2026 a 31/10/2026 → 10/2026)",
    },
    itens: {
      type: "array",
      description: "um item por FUNCIONÁRIO (ignore as vias repetidas do mesmo holerite)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "cargo", "salarioBase", "totalVencimentos", "totalDescontos", "liquido"],
        properties: {
          nome: { type: "string", description: "nome completo do empregado como está no holerite" },
          cargo: { type: ["string", "null"], description: "cargo/função" },
          salarioBase: num("valor da linha Salário Base (vencimento)"),
          totalVencimentos: num("total de vencimentos/proventos"),
          totalDescontos: num("total de descontos (INSS, IRRF, vale...)"),
          liquido: { type: "number", description: "Valor Líquido a receber" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê holerites brasileiros (demonstrativo de pagamento de salário) emitidos pela contabilidade. " +
  "Regras: 1) Um item por empregado: o PDF costuma trazer duas vias iguais de cada holerite — liste cada " +
  "empregado UMA vez. 2) Valores como número com ponto decimal (1.650,77 → 1650.77). 3) O líquido é o " +
  "campo 'Valor Líquido'. 4) Competência no formato MM/AAAA, tirada do período do holerite. 5) Não invente: " +
  "o que não estiver no documento vai null. 6) Responda somente com o JSON pedido.";

const IMAGENS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export async function lerHolerite(base64: string, mimeType: string): Promise<Holerite> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do holerite requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }
  const pdf = mimeType === "application/pdf";
  if (!pdf && !(IMAGENS as readonly string[]).includes(mimeType)) {
    throw new Error("Formato não suportado. Envie o holerite em PDF, JPG, PNG ou WEBP.");
  }
  const arquivo: Anthropic.Beta.BetaContentBlockParam = pdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as (typeof IMAGENS)[number], data: base64 } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [arquivo, { type: "text", text: "Leia os holerites deste arquivo." }] }],
    });
  } catch (e) {
    throw erroDaIa(e);
  }
  await recordAiUsage({ feature: "holerite", provider: config.provider, model: "claude-opus-5", usage: response.usage });
  if (response.stop_reason === "refusal") throw new Error("A IA não pôde ler este arquivo. Ajuste os valores à mão.");
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
  const r = holeriteSchema.safeParse(bruto);
  if (!r.success) throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  // Vias repetidas que escaparam: um item por nome.
  const vistos = new Set<string>();
  const itens = r.data.itens.filter((i) => {
    const k = i.nome.trim().toUpperCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return i.liquido > 0;
  });
  const comp = r.data.competencia?.trim() ?? null;
  return { competencia: comp && /^(0[1-9]|1[0-2])\/\d{4}$/.test(comp) ? comp : null, itens };
}
