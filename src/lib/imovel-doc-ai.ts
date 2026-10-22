import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { erroDaIa } from "@/lib/ai-errors";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";
import { CATEGORIA_ANEXO_KEYS } from "@/lib/imoveis";

/**
 * Leitura de um DOCUMENTO DE IMÓVEL via IA (mesma chave do Parecer IA).
 *
 * Uma chamada só responde às duas perguntas: QUE documento é (registro,
 * planta, declaração/recibo do ITR, DARF, comprovante…) e de que ano, e — quando
 * é o registro/matrícula ou um documento do ITR — os dados do imóvel que ele
 * traz (denominação, proprietário, CIB, área, matrícula, cartório, município).
 *
 * Os campos são texto puro ("" quando não há): a saída estruturada tem limite
 * baixo de campos com união de tipos, e aqui são muitos.
 */

const leituraSchema = z.object({
  tipoDocumento: z.enum(CATEGORIA_ANEXO_KEYS),
  exercicio: z.string(),
  descricao: z.string(),
  nome: z.string(),
  tipoImovel: z.string(),
  proprietario: z.string(),
  cib: z.string(),
  inscricaoMunicipal: z.string(),
  area: z.string(),
  matricula: z.string(),
  cartorio: z.string(),
  endereco: z.string(),
  municipio: z.string(),
  uf: z.string(),
  observacoes: z.string(),
});

export type LeituraDocumentoImovel = z.infer<typeof leituraSchema>;

const texto = (description: string) => ({ type: "string", description });

const LEITURA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(leituraSchema.shape),
  properties: {
    tipoDocumento: {
      type: "string",
      enum: CATEGORIA_ANEXO_KEYS,
      description:
        "ESCRITURA = certidão de matrícula/registro de imóveis, escritura, averbação, sentença registrada; " +
        "PLANTA = planta, memorial descritivo, georreferenciamento, croqui; " +
        "ITR_DECLARACAO = declaração do ITR (DITR) com os quadros do imóvel; " +
        "ITR_RECIBO = recibo de entrega da declaração do ITR; " +
        "DARF = DARF ou outra guia de imposto a pagar (ITR, IPTU); " +
        "COMPROVANTE = comprovante de pagamento (Pix, TED, boleto pago, autenticação bancária); " +
        "CONTRATO = contrato (arrendamento, compra e venda, prestação de serviço); OUTRO = qualquer outro",
    },
    exercicio: texto(
      "ano a que o documento se refere, 4 dígitos: o EXERCÍCIO do ITR na declaração/recibo/DARF; o ano do pagamento no comprovante; vazio nos demais",
    ),
    descricao: texto(
      "descrição curta e útil para uma lista, em português, até 90 caracteres. Ex.: 'Matrícula 12.345 — 1º Ofício de São José de Ribamar', " +
        "'Recibo da DITR 2026 nº 31.81.95.47.91.43', 'DARF ITR 2026 — R$ 10,82, vence 22/10/2026', 'Pix R$ 150,00 para José do Socorro (22/10/2026)'",
    ),
    nome: texto("denominação do imóvel (ex.: 'Sítio Rio São João', 'Fazenda Boa Vista', 'Lote 12 Quadra 3'); vazio se não houver"),
    tipoImovel: texto("RURAL ou URBANO; vazio se não der para saber"),
    proprietario: texto(
      "nome do proprietário ATUAL: no registro, o último adquirente/titular depois de todas as averbações e registros (ex.: sentença de usucapião, partilha); na DITR, o contribuinte",
    ),
    cib: texto("CIB (ou NIRF) do imóvel rural, como escrito (ex.: 7.223.419-9); vazio se não houver"),
    inscricaoMunicipal: texto("inscrição municipal/imobiliária do IPTU; vazio se não houver"),
    area: texto("área total com unidade, como no documento (ex.: '19,0 ha', '360,00 m²'); a ATUAL se houve retificação"),
    matricula: texto("número da matrícula no registro de imóveis; vazio se não houver"),
    cartorio: texto("cartório / serventia de registro de imóveis (ex.: 'Cartório do 1º Ofício de São José de Ribamar'); vazio se não houver"),
    endereco: texto("localização: estrada, rodovia, lugar, rua e número; sem município"),
    municipio: texto("município do imóvel"),
    uf: texto("sigla do estado do imóvel, 2 letras"),
    observacoes: texto(
      "até 3 linhas com o que importa e não cabe nos campos: ônus, hipoteca, usufruto, averbações relevantes, CCIR; vazio se nada",
    ),
  },
} as const;

const SYSTEM_PROMPT =
  "Você lê documentos brasileiros de IMÓVEIS (certidão de matrícula do registro de imóveis, escrituras, averbações, " +
  "plantas e memoriais, declaração e recibo do ITR, DARF, comprovantes de pagamento, contratos), muitas vezes digitalizados. " +
  "Regras: 1) Classifique o documento em tipoDocumento. 2) No registro/matrícula, leia TODAS as páginas: o proprietário e a área " +
  "que valem são os do último registro ou averbação. 3) Copie números (CIB, matrícula, recibo) exatamente como escritos. " +
  "4) Não invente: o que não estiver no documento fica como string vazia. Responda somente com o JSON pedido.";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof IMAGE_TYPES)[number];

/** Acima disso, só as primeiras páginas vão para a IA (a requisição tem teto). */
const MAX_PDF_IA = 20 * 1024 * 1024;

async function pdfParaIa(buffer: Buffer): Promise<Buffer> {
  if (buffer.byteLength <= MAX_PDF_IA) return buffer;
  const { PDFDocument } = await import("pdf-lib");
  const original = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const menor = await PDFDocument.create();
  const paginas = await menor.copyPages(original, original.getPageIndices().slice(0, 12));
  paginas.forEach((p) => menor.addPage(p));
  return Buffer.from(await menor.save());
}

export async function lerDocumentoImovel(buffer: Buffer, mimeType: string): Promise<LeituraDocumentoImovel> {
  const config = await getParecerConfig();
  if (!config.configured || !config.apiKey) {
    throw new Error("A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.");
  }
  if (config.provider !== "ANTHROPIC") {
    throw new Error("A leitura de documentos requer o provedor Anthropic (Parâmetros › Parecer IA).");
  }
  const isPdf = mimeType === "application/pdf" || buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf && !(IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("A leitura automática aceita PDF, JPG, PNG ou WEBP.");
  }

  const fileBlock: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: (await pdfParaIa(buffer)).toString("base64") },
      }
    : { type: "image", source: { type: "base64", media_type: mimeType as ImageMediaType, data: buffer.toString("base64") } };

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 4 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: LEITURA_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Leia este documento do imóvel." }] }],
    });
  } catch (e) {
    throw erroDaIa(e);
  }

  await recordAiUsage({ feature: "imovel", provider: config.provider, model: "claude-opus-5", usage: response.usage });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde ler este arquivo. Preencha os dados à mão.");
  }
  const bruto = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bruto);
  } catch {
    throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  }
  const r = leituraSchema.safeParse(parsed);
  if (!r.success) throw new Error("A IA não devolveu os dados no formato esperado. Tente novamente.");
  const d = r.data;
  return {
    ...d,
    exercicio: /^\d{4}$/.test(d.exercicio.trim()) ? d.exercicio.trim() : "",
    tipoImovel: /urb/i.test(d.tipoImovel) ? "URBANO" : /rur/i.test(d.tipoImovel) ? "RURAL" : "",
    uf: d.uf.trim().toUpperCase().slice(0, 2),
    descricao: d.descricao.trim().slice(0, 120),
  };
}
