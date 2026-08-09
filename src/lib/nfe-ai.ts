import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { nameKey } from "@/lib/person-keys";

/**
 * Leitura da NF-e (DANFE) via IA — mesma chave do Parecer IA, cadastrada em
 * Parâmetros.
 *
 * Toda compra de peça/serviço chega como um PDF da nota, e até aqui os dados
 * eram redigitados um a um na solicitação de compra. Aqui a nota é lida e a
 * solicitação nasce preenchida, faltando só a placa do veículo.
 *
 * Espelha `src/lib/crlv-ai.ts` (mesmo modelo, mesmo `effort: "low"`, mesmo par
 * zod + JSON Schema, mesmo mapeamento de erros) e aceita PDF ou foto — o DANFE
 * também chega fotografado.
 */

/**
 * Categorias possíveis, fechadas de propósito: `resolveDespesaCategory` cria
 * uma categoria nova quando não conhece o rótulo, e um nome livre vindo da IA
 * ("Autopeças", "Peças e pneus", "Peça automotiva") encheria o cadastro de
 * variações da mesma coisa. "Combustível" e "Documentação de veículo" já são
 * categorias do sistema e casam exatamente.
 */
const CATEGORIAS = [
  "Peças",
  "Óleo e lubrificantes",
  "Pneus",
  "Serviço",
  "Combustível",
  "Documentação de veículo",
  "Despesa operacional",
  "Outros",
] as const;

/**
 * Fecha a categoria na lista acima: casa ignorando acento e maiúscula e cai em
 * "Peças" quando não reconhece. Fica aqui (e não no JSON Schema) porque `enum`
 * com tipo anulável faz a API recusar o pedido.
 */
export function normalizeCategoria(valor: string | null | undefined): string {
  const key = nameKey(valor);
  return CATEGORIAS.find((c) => nameKey(c) === key) ?? "Peças";
}

const itemSchema = z.object({
  descricao: z.string(),
  quantidade: z.number().nullable(),
  valorUnitario: z.number().nullable(),
  valorTotal: z.number().nullable(),
});

const nfeSchema = z.object({
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  chaveAcesso: z.string().nullable(),
  emitidaEm: z.string().nullable(),
  emitenteNome: z.string().nullable(),
  emitenteCnpj: z.string().nullable(),
  destinatarioNome: z.string().nullable(),
  destinatarioCnpj: z.string().nullable(),
  valorTotal: z.number().nullable(),
  naturezaOperacao: z.string().nullable(),
  formaPagamento: z.string().nullable(),
  categoria: z.string().nullable(),
  itens: z.array(itemSchema),
});

export type NfeExtraida = z.infer<typeof nfeSchema>;
export type NfeItem = z.infer<typeof itemSchema>;

// structured outputs exige `additionalProperties: false` e todos os campos em
// `required` (nulo se não achar), por isso o schema vai duplicado aqui.
const NFE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "numero",
    "serie",
    "chaveAcesso",
    "emitidaEm",
    "emitenteNome",
    "emitenteCnpj",
    "destinatarioNome",
    "destinatarioCnpj",
    "valorTotal",
    "naturezaOperacao",
    "formaPagamento",
    "categoria",
    "itens",
  ],
  properties: {
    numero: { type: ["string", "null"], description: "número da nota, só dígitos" },
    serie: { type: ["string", "null"], description: "série da nota, só dígitos" },
    chaveAcesso: { type: ["string", "null"], description: "os 44 dígitos da chave, sem espaços" },
    emitidaEm: { type: ["string", "null"], description: "data de emissão no formato aaaa-mm-dd" },
    emitenteNome: { type: ["string", "null"], description: "razão social de quem EMITIU (o fornecedor)" },
    emitenteCnpj: { type: ["string", "null"], description: "CNPJ do emitente, só dígitos" },
    destinatarioNome: { type: ["string", "null"] },
    destinatarioCnpj: { type: ["string", "null"], description: "só dígitos" },
    valorTotal: { type: ["number", "null"], description: "valor total da nota, em reais" },
    naturezaOperacao: { type: ["string", "null"] },
    formaPagamento: {
      type: ["string", "null"],
      description: "como foi pago, se constar (ex.: 'Cartão de débito', 'Boleto', 'Dinheiro')",
    },
    categoria: {
      type: ["string", "null"],
      // Sem `enum` aqui de propósito: combinado com tipo anulável, o validador
      // de structured outputs recusa a requisição inteira (erro 400). A lista
      // é pedida no texto e fechada no servidor por `normalizeCategoria`.
      description:
        "tipo de despesa, a partir dos itens da nota — use exatamente uma destas: Peças, Óleo e lubrificantes, Pneus, Serviço, Combustível, Documentação de veículo, Despesa operacional, Outros",
    },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["descricao", "quantidade", "valorUnitario", "valorTotal"],
        properties: {
          descricao: { type: "string", description: "descrição do produto/serviço" },
          quantidade: { type: ["number", "null"] },
          valorUnitario: { type: ["number", "null"] },
          valorTotal: { type: ["number", "null"] },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "Você transcreve notas fiscais eletrônicas brasileiras (DANFE). Leia o documento e devolva os " +
  "campos pedidos exatamente como impressos. Regras: " +
  "1) EMITENTE é quem vendeu (aparece no topo, com a logomarca); DESTINATÁRIO é quem comprou. " +
  "Não troque um pelo outro. " +
  "2) CNPJ e chave de acesso: só os dígitos, sem pontos, barras ou espaços. A chave tem 44 dígitos. " +
  "3) Datas no formato aaaa-mm-dd. Use a DATA DE EMISSÃO. " +
  "4) Valores como número, com ponto decimal (399.00), sem 'R$' nem separador de milhar. " +
  "5) VALOR TOTAL é o valor total da nota, não a soma dos produtos, quando os dois aparecerem. " +
  "6) ITENS: uma entrada por linha da tabela de produtos/serviços, com a descrição como está " +
  "impressa. Ignore as linhas de 'Valor Aprox. dos Tributos'. " +
  "7) FORMA DE PAGAMENTO só se constar em algum lugar da nota (costuma vir em 'Dados adicionais'). " +
  "8) CATEGORIA: escolha exatamente uma destas, sem inventar outra — Peças, Óleo e lubrificantes, " +
  "Pneus, Serviço, Combustível, Documentação de veículo, Despesa operacional, Outros. " +
  "9) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "10) Responda somente com o JSON pedido.";

/** Tipos de imagem que a API aceita no bloco `image`. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

function isImageType(mime: string): mime is ImageMediaType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

/**
 * @param base64 conteúdo do arquivo
 * @param mimeType tipo do arquivo (`application/pdf` ou uma imagem suportada)
 */
export async function extractNfe(base64: string, mimeType: string): Promise<NfeExtraida> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura da nota fiscal requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    // O caso real é a foto do iPhone, que chega em HEIC. A tela converte para
    // JPEG antes de enviar; se a conversão falhar, o arquivo cru cai aqui.
    throw new Error(
      "Não consegui ler esta foto (o iPhone salva em HEIC, que a leitura não aceita). " +
        "Tente de novo pelo botão de tirar foto, ou envie o PDF da nota.",
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
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Transcrição é tarefa mecânica: esforço baixo basta e sai mais rápido.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: NFE_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: [fileBlock, { type: "text", text: "Transcreva esta nota fiscal." }] },
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

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Lance a compra à mão.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("A nota é grande demais para a leitura automática. Lance a compra à mão.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os dados da nota no formato esperado. Tente novamente.");
  }
  const result = nfeSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados da nota no formato esperado. Tente novamente.");
  }
  return result.data;
}
