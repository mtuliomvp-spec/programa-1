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
  // De ONDE saiu o dinheiro: é isso que diz em qual conta financeira a baixa
  // tem de entrar. O banco imprime de um jeito diferente em cada comprovante,
  // então vêm os três campos separados e o texto cru como estava.
  banco: z.string().nullable().optional(),
  agencia: z.string().nullable().optional(),
  conta: z.string().nullable().optional(),
  contaDebitada: z.string().nullable().optional(),
  // A QUEM se pagou — serve para conferir com o fornecedor do título.
  beneficiario: z.string().nullable().optional(),
  // CPF/CNPJ (ou chave Pix que seja CPF/CNPJ) de quem RECEBEU: confere com o
  // documento do fornecedor de forma muito mais segura que o nome.
  documentoBeneficiario: z.string().nullable().optional(),
  // Como o dinheiro saiu: PIX, TED, DOC, TRANSFERENCIA, BOLETO ou OUTRO.
  formaPagamento: z.string().nullable().optional(),
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
        required: [
          "pagina",
          "valor",
          "data",
          "descricao",
          "banco",
          "agencia",
          "conta",
          "contaDebitada",
          "beneficiario",
          "documentoBeneficiario",
          "formaPagamento",
        ],
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
          banco: {
            type: ["string", "null"],
            description: "nome ou número do banco DE ONDE SAIU o dinheiro (conta debitada/pagador), ex. 'Bradesco', '237'",
          },
          agencia: {
            type: ["string", "null"],
            description: "agência da conta debitada, só dígitos (sem o dígito verificador)",
          },
          conta: {
            type: ["string", "null"],
            description: "número da conta debitada, só dígitos (sem o dígito verificador)",
          },
          contaDebitada: {
            type: ["string", "null"],
            description: "a identificação da conta debitada como está impressa, ex. 'Bradesco Ag 1639-x C/C 205986-x'",
          },
          beneficiario: {
            type: ["string", "null"],
            description:
              "nome de QUEM RECEBEU o pagamento (favorecido/recebedor/cedente), como impresso. Em Pix é o bloco 'Recebedor'",
          },
          documentoBeneficiario: {
            type: ["string", "null"],
            description:
              "CPF/CNPJ de QUEM RECEBEU, só dígitos e SOMENTE quando completo (o mascarado com asteriscos vai null). Chave Pix que seja um CPF/CNPJ vale como documento",
          },
          formaPagamento: {
            type: ["string", "null"],
            description:
              "como o dinheiro saiu: exatamente PIX, TED, DOC, TRANSFERENCIA (entre contas do mesmo banco), BOLETO ou OUTRO",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê COMPROVANTES DE PAGAMENTO bancários de qualquer tipo — boleto, Pix, TED, DOC e " +
  "transferência entre contas (normalmente um comprovante por página; " +
  "uma página pode ter mais de um). Para CADA comprovante, devolva: a página em que ele está, o " +
  "VALOR TOTAL pago (número, ponto decimal), a DATA do pagamento (AAAA-MM-DD) e uma descrição curta " +
  "(convênio, beneficiário ou tributo — ex.: 'SEFAZ MA - IPVA', 'Pagamento de título — Fulano'). " +
  "Devolva também DE ONDE saiu o dinheiro (banco, agência e conta DEBITADAS — o pagador, nunca o " +
  "favorecido), QUEM RECEBEU (beneficiário/favorecido/recebedor/cedente) com o CPF/CNPJ dele, e a " +
  "FORMA (Pix, TED, DOC, transferência, boleto). " +
  "Regras: 1) O valor é o total efetivamente pago no comprovante. 2) CONTA DEBITADA é a do PAGADOR: " +
  "todo comprovante mostra os dois lados (quem pagou e quem recebeu) — em Pix e TED eles vêm em " +
  "blocos 'Pagador' e 'Recebedor'/'Favorecido'. Não troque um pelo outro. Agência e conta só com os " +
  "dígitos, sem o dígito verificador. 3) DOCUMENTO DO BENEFICIÁRIO: o CPF/CNPJ de quem recebeu, só " +
  "quando estiver COMPLETO — o mascarado ('***.721.943-**') vai null. Chave Pix que seja um CPF/CNPJ " +
  "conta como documento. 4) Não invente: campo ilegível vai null. 5) Páginas que não são " +
  "comprovantes (capa, índice) ficam de fora. 6) Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

/**
 * @param mimeType do arquivo. O lote do banco vem em PDF, mas o comprovante
 * avulso do título costuma ser uma FOTO da tela do aplicativo.
 */
export async function extractPaymentReceipts(
  base64: string,
  mimeType = "application/pdf",
): Promise<ComprovanteExtraido[]> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura de comprovantes requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("Formato não suportado para leitura automática. Anexe o comprovante em PDF, JPG, PNG ou WEBP.");
  }
  const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data: base64 } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });

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
            fileBlock,
            { type: "text", text: "Liste os comprovantes de pagamento deste arquivo." },
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
