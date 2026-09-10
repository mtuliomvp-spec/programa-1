import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { erroDaIa } from "@/lib/ai-errors";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

/**
 * Leitura de BOLETO/GUIA de pagamento anexado ao veículo (PDF ou foto) via IA —
 * mesma chave do Parecer IA, mesmo molde de `src/lib/crlv-ai.ts`.
 *
 * Existe para casar a guia real (IPVA, multa, licenciamento, quitação de
 * financiamento) com os valores descontados na negociação: o valor lido
 * alimenta as regras de desconto/acréscimo já existentes (consignado → ajusta a
 * devolução ao proprietário; compra → guias × acordado vira custo de ajuste).
 */

/** Tipos que o casamento entende; qualquer outro texto vira OUTRO. */
const TIPOS = ["QUITACAO", "IPVA", "LICENCIAMENTO", "MULTA", "TAXA", "OUTRO"] as const;
export type BoletoTipo = (typeof TIPOS)[number];

const boletoSchema = z.object({
  valor: z.number().nullable(),
  // Valor CHEIO da MULTA quando há desconto por pagamento até o vencimento
  // (20% por lei — CTB art. 284). Só multa tem essa regra; nos demais é null.
  valorSemDesconto: z.number().nullable().optional(),
  vencimento: z.string().nullable(),
  // String livre no schema (não enum): declarar `enum` junto com
  // `type: ["string","null"]` é recusado pelo validador de structured outputs
  // ("Enum value 'QUITACAO' does not match declared type"). A normalização
  // para o conjunto conhecido é feita aqui embaixo.
  tipo: z.string().nullable(),
  descricao: z.string().nullable(),
  cedente: z.string().nullable(),
  // Linha digitável: vai para o título e sai na Ordem de Pagamento (copiar/colar).
  linhaDigitavel: z.string().nullable().optional(),
  // Desconto por pontualidade impresso no boleto ("Desconto de R$ 150,00 até o
  // vencimento") — comum em condomínio, mensalidade e associação. Diferente do
  // desconto legal da MULTA: aqui é uma condição do próprio boleto.
  desconto: z.number().nullable().optional(),
  descontoAte: z.string().nullable().optional(),
  // Competência/referência do que o boleto cobra: o MÊS DE CONSUMO da conta de
  // luz, a mensalidade de setembro, a parcela do exercício. Não confundir com
  // o vencimento — a conta de agosto vence em setembro.
  referencia: z.string().nullable().optional(),
});

export type BoletoExtraido = Omit<z.infer<typeof boletoSchema>, "tipo"> & {
  tipo: BoletoTipo | null;
};

/** Texto devolvido pela IA → um dos tipos conhecidos (ou null). */
function normalizeTipo(raw: string | null): BoletoTipo | null {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return null;
  const exact = TIPOS.find((t) => t === value);
  if (exact) return exact;
  // Tolerante ao texto livre: "quitação de financiamento", "IPVA 2026"...
  const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (key.includes("QUITAC")) return "QUITACAO";
  if (key.includes("IPVA")) return "IPVA";
  if (key.includes("LICENC")) return "LICENCIAMENTO";
  if (key.includes("MULTA")) return "MULTA";
  if (key.includes("TAXA")) return "TAXA";
  return "OUTRO";
}

const BOLETO_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "valor",
    "valorSemDesconto",
    "vencimento",
    "tipo",
    "descricao",
    "cedente",
    "linhaDigitavel",
    "desconto",
    "descontoAte",
    "referencia",
  ],
  properties: {
    valor: {
      type: ["number", "null"],
      description:
        "valor A PAGAR ATÉ O VENCIMENTO, em reais — em guia de MULTA, já com o desconto de 20% por pontualidade; nos demais tipos, o valor do documento",
    },
    valorSemDesconto: {
      type: ["number", "null"],
      description:
        "SOMENTE em guia de MULTA com desconto por pontualidade: o valor cheio (sem o desconto). Em IPVA, licenciamento, taxa e quitação é sempre null",
    },
    vencimento: { type: ["string", "null"], description: "data de vencimento em yyyy-mm-dd" },
    tipo: {
      type: ["string", "null"],
      description:
        "exatamente um destes valores: QUITACAO (boleto de quitação de financiamento de veículo, emitido por banco/financeira), IPVA, LICENCIAMENTO, MULTA, TAXA (guias de órgãos) ou OUTRO",
    },
    descricao: {
      type: ["string", "null"],
      description: "descrição curta do que o boleto cobra, ex. 'IPVA 2026 cota única'",
    },
    cedente: { type: ["string", "null"], description: "beneficiário/cedente do boleto" },
    linhaDigitavel: {
      type: ["string", "null"],
      description:
        "linha digitável do código de barras, como impressa (com pontos e espaços); null se não constar",
    },
    desconto: {
      type: ["number", "null"],
      description:
        "abatimento em REAIS que o boleto concede por pagar dentro do prazo, quando impresso em texto (ex.: 'Desconto de R$ 150,00 até o vencimento' → 150). Percentual: converta para reais sobre o valor. null quando o boleto não oferece desconto",
    },
    descontoAte: {
      type: ["string", "null"],
      description:
        "data limite do desconto em yyyy-mm-dd. Quando o texto diz 'até o vencimento', repita a data de vencimento. null quando não há desconto",
    },
    referencia: {
      type: ["string", "null"],
      description:
        "competência/referência do que o boleto cobra, como impressa: mês de consumo da conta de luz/água/telefone ('AGO/2026'), mês da mensalidade ('Setembro/2026'), exercício do IPVA ('2026') ou o período ('01/08/2026 a 31/08/2026'). NÃO é o vencimento. null quando o documento não traz",
    },
  },
} as const;

// O arquivo pode trazer VÁRIOS boletos (é comum o órgão emitir um PDF com as
// guias do exercício, uma por página) — por isso a resposta é uma lista.
const BOLETOS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["boletos"],
  properties: {
    boletos: {
      type: "array",
      description: "um item por boleto/guia distinto encontrado no arquivo",
      items: BOLETO_ITEM_SCHEMA,
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve boletos e guias de pagamento brasileiros (IPVA, licenciamento, multas, taxas, " +
  "quitação de financiamento de veículo). Leia o documento e devolva os campos pedidos. Regras: " +
  "1) VALOR: o valor A PAGAR ATÉ O VENCIMENTO, número em reais com ponto decimal. " +
  "SOMENTE em guias de MULTA de trânsito existe desconto por pontualidade (20% por lei): nesse " +
  "caso VALOR é o já descontado e VALORSEMDESCONTO é o valor cheio. Em IPVA, licenciamento, taxas " +
  "e quitação, VALORSEMDESCONTO é SEMPRE null e VALOR é o valor do documento. " +
  "Não use valores com juros/mora de atraso. " +
  "2) VENCIMENTO: a data de vencimento no formato yyyy-mm-dd. " +
  "3) TIPO: QUITACAO quando for boleto de quitação/liquidação de financiamento emitido por " +
  "banco/financeira; IPVA, LICENCIAMENTO, MULTA ou TAXA para guias de órgãos; OUTRO nos demais. " +
  "4) O arquivo pode conter MAIS DE UM boleto/guia (uma por página, ou várias na mesma página): " +
  "devolva UM ITEM POR BOLETO DISTINTO, cada um com o seu valor e vencimento. Não some valores de " +
  "boletos diferentes e não repita o mesmo boleto (a 2ª via / o canhoto do MESMO documento, com " +
  "mesmo valor e vencimento, conta uma vez só). " +
  "5) DESCONTO: muitos boletos (condomínio, mensalidade, associação) trazem em texto uma condição " +
  "de pontualidade — 'Desconto de R$ 150,00 até o vencimento', 'Desconto de 10% até o dia 10'. " +
  "Quando houver, DESCONTO é o abatimento em reais (converta o percentual sobre o valor) e " +
  "DESCONTOATE é a data limite (yyyy-mm-dd; 'até o vencimento' = a data de vencimento). " +
  "Não confunda com MULTA e MORA, que são acréscimos por atraso, nem com o desconto legal de " +
  "20% da multa de trânsito (esse continua em VALOR/VALORSEMDESCONTO). Sem condição de desconto " +
  "impressa, os dois campos vão null. " +
  "6) REFERÊNCIA: a competência do que está sendo cobrado — o mês de CONSUMO na conta de luz, água " +
  "ou telefone ('Referente a AGO/2026'), o mês da mensalidade, o exercício do IPVA. Copie como está " +
  "impresso. Cuidado: NÃO é o vencimento (a conta de agosto vence em setembro) nem a data de emissão. " +
  "Sem referência impressa, vai null. " +
  "7) LINHA DIGITÁVEL: o código de barras em números, como impresso (47/48 dígitos em boleto bancário, " +
  "48 em guia de concessionária/órgão). É o que o usuário copia para pagar — transcreva sem trocar dígito. " +
  "8) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "9) Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

export async function extractBoletos(base64: string, mimeType: string): Promise<BoletoExtraido[]> {
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

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: BOLETOS_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            { type: "text", text: "Transcreva TODOS os boletos/guias deste arquivo." },
          ],
        },
      ],
    });
  } catch (e) {
    throw erroDaIa(e);
  }

  // Contador de uso de IA da instalação (não interfere no resultado).
  await recordAiUsage({
    feature: "boleto",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

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
  const result = z.object({ boletos: z.array(boletoSchema) }).safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados do boleto no formato esperado. Tente novamente.");
  }
  // Dedupe defensivo: 2ª via / canhoto do MESMO boleto (mesmo valor e
  // vencimento) não pode virar dois ajustes.
  const seen = new Set<string>();
  const out: BoletoExtraido[] = [];
  for (const b of result.data.boletos) {
    const key = `${b.valor ?? ""}|${b.vencimento ?? ""}`;
    if (b.valor != null && seen.has(key)) continue;
    if (b.valor != null) seen.add(key);
    out.push({ ...b, tipo: normalizeTipo(b.tipo) });
  }
  return out;
}
