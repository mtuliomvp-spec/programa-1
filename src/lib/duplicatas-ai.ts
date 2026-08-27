import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura de um RELATÓRIO DE DUPLICATAS EM ABERTO de fornecedor (PDF) via IA —
 * mesma chave do Parecer IA (Parâmetros). Devolve o fornecedor e cada
 * duplicata (NF, parcela, emissão, vencimento, valor) para o sistema criar os
 * títulos a pagar que ainda não existem.
 *
 * Espelha `src/lib/receipts-ai.ts` (mesmo modelo, esforço baixo, par zod +
 * JSON Schema, mesmo mapeamento de erros).
 */

const duplicataSchema = z.object({
  fatura: z.string().nullable(),
  parcela: z.number().int().nullable(),
  nota: z.string().nullable(),
  serie: z.string().nullable(),
  emissao: z.string().nullable(),
  vencimento: z.string().nullable(),
  valor: z.number().nullable(),
});

const reportSchema = z.object({
  fornecedorNome: z.string().nullable(),
  fornecedorCnpj: z.string().nullable(),
  duplicatas: z.array(duplicataSchema),
});

export type DuplicataExtraida = z.infer<typeof duplicataSchema>;
export type RelatorioDuplicatas = z.infer<typeof reportSchema>;

const REPORT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fornecedorNome", "fornecedorCnpj", "duplicatas"],
  properties: {
    fornecedorNome: {
      type: ["string", "null"],
      description: "nome/razão social do FORNECEDOR que emitiu o relatório (não o cliente)",
    },
    fornecedorCnpj: { type: ["string", "null"], description: "CNPJ do fornecedor, só dígitos" },
    duplicatas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fatura", "parcela", "nota", "serie", "emissao", "vencimento", "valor"],
        properties: {
          fatura: { type: ["string", "null"], description: "número da fatura/duplicata" },
          parcela: { type: ["integer", "null"], description: "número da parcela (DDP), ex. 1, 2" },
          nota: { type: ["string", "null"], description: "número da NOTA FISCAL (NF)" },
          serie: { type: ["string", "null"], description: "série da NF" },
          emissao: { type: ["string", "null"], description: "data de emissão, AAAA-MM-DD" },
          vencimento: { type: ["string", "null"], description: "data de vencimento da PARCELA, AAAA-MM-DD" },
          valor: {
            type: ["number", "null"],
            description: "valor da PARCELA (coluna TOTAL da duplicata), como número (ex. 334.69)",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê um RELATÓRIO/RELAÇÃO DE DUPLICATAS EM ABERTO emitido por um fornecedor. Cada linha é uma " +
  "PARCELA de uma fatura, ligada a uma NOTA FISCAL. Devolva o fornecedor (quem emitiu o relatório — " +
  "nome e CNPJ, normalmente no rodapé) e TODAS as duplicatas, cada uma com: número da fatura, número " +
  "da parcela, número da NF, série, data de emissão, data de VENCIMENTO da parcela e o VALOR DA " +
  "PARCELA (não o total da NF). Regras: 1) Datas em AAAA-MM-DD. 2) Valores como número com ponto " +
  "decimal. 3) Não invente: campo ilegível vai null. 4) Não pule nenhuma parcela — faturas com 2 " +
  "parcelas geram 2 itens. 5) Responda somente com o JSON pedido.";

export async function extractDuplicatas(base64: string): Promise<RelatorioDuplicatas> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura do relatório requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: REPORT_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Liste as duplicatas em aberto deste relatório." },
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
    // Sobrecarga passageira do provedor (529 "overloaded" e afins): não é o
    // arquivo nem a chave — repetir em instantes resolve. Sem este ramo, o
    // usuário via "a IA recusou o pedido" com JSON cru e achava que era erro
    // no documento dele.
    if (
      e instanceof Anthropic.APIError &&
      (Number(e.status) >= 500 || /overloaded/i.test(e.message || ""))
    ) {
      throw new Error(
        "Os servidores da IA estão sobrecarregados neste momento — não é nada com o seu arquivo. Aguarde um minuto e tente de novo.",
      );
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
    feature: "duplicatas",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Lance os títulos manualmente.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu as duplicatas no formato esperado. Tente novamente.");
  }
  const result = reportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu as duplicatas no formato esperado. Tente novamente.");
  }
  return result.data;
}
