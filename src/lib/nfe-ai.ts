import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";

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

const itemSchema = z.object({
  descricao: z.string(),
  quantidade: z.number().nullable(),
  valorUnitario: z.number().nullable(),
  valorTotal: z.number().nullable(),
});

const duplicataNfeSchema = z.object({
  vencimento: z.string().nullable(),
  valor: z.number().nullable(),
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
  // Fatura/duplicatas do DANFE (parcelas com vencimento e valor). Vazio quando
  // a nota não traz cobrança parcelada.
  duplicatas: z.array(duplicataNfeSchema),
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
    "duplicatas",
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
    duplicatas: {
      // Sem tipos anuláveis aqui de propósito: o structured output limita a 16
      // parâmetros com union/null no schema inteiro — parcela ilegível fica de
      // FORA da lista (regra no prompt), em vez de vir null.
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vencimento", "valor"],
        properties: {
          vencimento: { type: "string", description: "vencimento da parcela, aaaa-mm-dd" },
          valor: { type: "number", description: "valor da parcela, como número" },
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
  "9) DUPLICATAS: o campo FATURA/DUPLICATAS do DANFE lista as parcelas de cobrança " +
  "(ex.: 'VENC - 31-08-2026 - R$ 91,35') — devolva uma entrada por parcela, com vencimento " +
  "(aaaa-mm-dd) e valor. Sem parcelas na nota, devolva a lista vazia; parcela que você não " +
  "conseguir ler com segurança fica DE FORA da lista (não devolva null). " +
  "10) Não invente nada: campo que você não conseguir ler com segurança vai null. " +
  "11) Responda somente com o JSON pedido.";

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

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });

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
    feature: "nfe",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

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

// ---------------------------------------------------------------------------
// Lote: um PDF com VÁRIAS NF-e (DANFEs concatenadas). Devolve cada nota com o
// intervalo de páginas dela, para o chamador recortar o PDF por nota.
// ---------------------------------------------------------------------------

const nfeLoteNotaSchema = nfeSchema.extend({
  paginaInicial: z.number().int().nullable(),
  paginaFinal: z.number().int().nullable(),
});

const nfeLoteSchema = z.object({ notas: z.array(nfeLoteNotaSchema) });

export type NfeLoteNota = z.infer<typeof nfeLoteNotaSchema>;

const NFE_LOTE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["notas"],
  properties: {
    notas: {
      type: "array",
      items: {
        ...NFE_JSON_SCHEMA,
        required: [...NFE_JSON_SCHEMA.required, "paginaInicial", "paginaFinal"],
        properties: {
          ...NFE_JSON_SCHEMA.properties,
          // Não-anuláveis (limite de 16 unions do structured output): a página
          // sempre existe — é onde a nota está no PDF.
          paginaInicial: {
            type: "integer",
            description: "primeira página do PDF em que esta nota aparece (começando em 1)",
          },
          paginaFinal: {
            type: "integer",
            description: "última página do PDF desta nota (igual à inicial quando é uma página só)",
          },
        },
      },
    },
  },
} as const;

const LOTE_PROMPT =
  SYSTEM_PROMPT +
  " ATENÇÃO: este PDF pode conter VÁRIAS notas fiscais (DANFEs) — uma por página ou em blocos de " +
  "páginas. Devolva UMA entrada por nota (não misture itens de notas diferentes) e informe, em cada " +
  "uma, a primeira e a última página em que ela aparece (contando a partir de 1).";

/** Lê um PDF com uma ou várias NF-e; cada nota volta com o intervalo de páginas. */
export async function extractNfeLote(base64: string): Promise<NfeLoteNota[]> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura da nota fiscal requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: NFE_LOTE_JSON_SCHEMA },
      },
      system: LOTE_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Transcreva todas as notas fiscais deste PDF." },
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
    feature: "nfe",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Lance os títulos à mão.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("O PDF tem notas demais para uma leitura só — divida em arquivos menores.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu as notas no formato esperado. Tente novamente.");
  }
  const result = nfeLoteSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu as notas no formato esperado. Tente novamente.");
  }
  return result.data.notas;
}

// ---------------------------------------------------------------------------
// Leitura FOCADA na chave de acesso (Renave)
// ---------------------------------------------------------------------------

/**
 * O registro no Renave precisa da chave de acesso da NF-e (arts. 15/18, VII), e
 * ela é o único dado que amarra a nota ao registro. A transcrição completa
 * (extractNfe) às vezes volta sem a chave: ela é impressa na tarja do código de
 * barras, em blocos de 4 dígitos, longe do corpo da nota — e o pedido genérico
 * dilui a atenção do modelo entre itens, duplicatas e categoria.
 *
 * Esta leitura pede SÓ o que interessa e diz onde procurar. Devolve o que leu
 * mesmo quando a chave sai torta, para a tela poder explicar o que aconteceu em
 * vez de dizer só "não encontrei".
 */
const chaveSchema = z.object({
  chaveAcesso: z.string().nullable(),
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  emitidaEm: z.string().nullable(),
  emitenteNome: z.string().nullable(),
  emitenteCnpj: z.string().nullable(),
  valorTotal: z.number().nullable(),
});

export type NfeChaveExtraida = z.infer<typeof chaveSchema>;

const CHAVE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chaveAcesso", "numero", "serie", "emitidaEm", "emitenteNome", "emitenteCnpj", "valorTotal"],
  properties: {
    chaveAcesso: {
      type: ["string", "null"],
      description: "os 44 dígitos da chave de acesso, sem espaços nem pontos",
    },
    numero: { type: ["string", "null"], description: "número da nota (ex.: 13786)" },
    serie: { type: ["string", "null"], description: "série da nota (ex.: 4)" },
    emitidaEm: { type: ["string", "null"], description: "data de emissão no formato aaaa-mm-dd" },
    emitenteNome: { type: ["string", "null"], description: "razão social de quem emitiu a nota" },
    emitenteCnpj: { type: ["string", "null"], description: "CNPJ do emitente, só dígitos" },
    valorTotal: { type: ["number", "null"], description: "valor total da nota" },
  },
} as const;

const CHAVE_PROMPT =
  "Você lê a CHAVE DE ACESSO de uma nota fiscal eletrônica brasileira (DANFE). Onde procurar, nesta " +
  "ordem: 1) na tarja do topo do DANFE, no campo 'CHAVE DE ACESSO', logo abaixo ou acima do código de " +
  "barras — costuma vir em 11 blocos de 4 dígitos separados por espaço (ex.: 3126 0816 6700 8500 0155 " +
  "5500 4000 0137 8618 9346 0739); 2) perto da frase 'Consulta de autenticidade no portal nacional da " +
  "NF-e'; 3) no protocolo de autorização de uso. A chave tem EXATAMENTE 44 dígitos: devolva só os " +
  "dígitos, sem espaços. Confira o total antes de responder — se você contar diferente de 44, leia de " +
  "novo. Se o documento não for um DANFE (ex.: contrato, recibo), devolva chaveAcesso null. Devolva " +
  "também número, série, data de emissão (aaaa-mm-dd), razão social e CNPJ do emitente e o valor total " +
  "da nota. Não invente nada: o que não conseguir ler com segurança vai null. Responda só com o JSON.";

export async function extractNfeChave(base64: string, mimeType: string): Promise<NfeChaveExtraida> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura da nota fiscal requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }

  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !isImageType(mimeType)) {
    throw new Error(
      "Não consegui ler este arquivo (o iPhone salva em HEIC, que a leitura não aceita). " +
        "Envie o PDF do DANFE ou uma foto em JPEG.",
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
      max_tokens: 1500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: CHAVE_JSON_SCHEMA } },
      system: CHAVE_PROMPT,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: "Qual é a chave de acesso desta nota?" }],
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
      throw new Error(`A IA recusou o pedido (${e.status})${detalhe ? `: ${detalhe}` : "."}`);
    }
    throw e;
  }

  await recordAiUsage({
    feature: "nfe",
    provider: config.provider,
    model: "claude-opus-5",
    usage: response.usage,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  }
  const result = chaveSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  }
  return result.data;
}
