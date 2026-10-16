import type { CrlvExtraido } from "@/lib/crlv-ai";
import type { AtpvExtraido } from "@/lib/atpv-ai";
import type { ContratoExtraido } from "@/lib/contract-ai";
import { chaveNfeValida, dadosDaChaveNfe } from "@/lib/renave";

/**
 * Documentos da COMPRA de um veículo, anexados de uma vez em "Novo veículo":
 * cada arquivo é reconhecido (CRLV, ATPV-e, NF-e, boleto/Pix, contrato), lido,
 * e o conjunto preenche o cadastro. Ao salvar, cada arquivo vai para o seu
 * lugar na ficha (card CRLV, card ATPV-e, Documentos, título da compra).
 *
 * Puro (sem banco nem IA): a tela usa os rótulos e o servidor, a consolidação.
 */

export type TipoDocCompra = "CRLV" | "ATPV" | "NFE" | "PAGAMENTO" | "CONTRATO" | "OUTRO";

export const TIPOS_DOC_COMPRA: readonly TipoDocCompra[] = ["CRLV", "ATPV", "NFE", "PAGAMENTO", "CONTRATO", "OUTRO"];

export const ROTULO_DOC_COMPRA: Record<TipoDocCompra, string> = {
  CRLV: "CRLV",
  ATPV: "ATPV-e",
  NFE: "Nota fiscal da compra (NF-e)",
  PAGAMENTO: "Boleto / Pix do pagamento",
  CONTRATO: "Contrato de compra",
  OUTRO: "Outro documento",
};

/** Onde o arquivo fica na ficha depois de salvar. */
export const DESTINO_DOC_COMPRA: Record<TipoDocCompra, string> = {
  CRLV: "card CRLV",
  ATPV: "card ATPV-e",
  NFE: "Documentos do veículo (e a chave no Renave)",
  PAGAMENTO: "título a pagar da compra (Boleto)",
  CONTRATO: "Documentos do veículo",
  OUTRO: "Documentos do veículo",
};

export type PagamentoLido = {
  valor: number | null;
  /** aaaa-mm-dd */
  vencimento: string | null;
  /** Código "Pix copia e cola" (EMV, começa com 000201). */
  pix: string | null;
  linhaDigitavel: string | null;
};

export type NfeCompraLida = {
  chave: string | null;
  numero: string | null;
  serie: string | null;
  /** aaaa-mm-dd */
  emitidaEm: string | null;
  emitenteNome: string | null;
  emitenteDocumento: string | null;
  valorTotal: number | null;
};

export type DocCompraLido =
  | { tipo: "CRLV"; crlv: CrlvExtraido }
  | { tipo: "ATPV"; atpv: AtpvExtraido }
  | { tipo: "NFE"; nfe: NfeCompraLida }
  | { tipo: "PAGAMENTO"; pagamento: PagamentoLido }
  | { tipo: "CONTRATO"; contrato: ContratoExtraido }
  | { tipo: "OUTRO" };

const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/**
 * Tipo pelo TEXTO do PDF (sem IA): os documentos oficiais têm títulos fixos.
 * null = não deu para afirmar (foto, PDF escaneado, texto ilegível) — aí quem
 * decide é a IA.
 */
export function tipoPeloTexto(texto: string): TipoDocCompra | null {
  const t = sem(texto);
  if (t.replace(/\s/g, "").length < 40) return null;
  if (/AUTORIZACAO PARA TRANSFERENCIA DE PROPRIEDADE/.test(t)) return "ATPV";
  if (/CERTIFICADO DE REGISTRO E LICENCIAMENTO/.test(t)) return "CRLV";
  if (/DANFE|DOCUMENTO AUXILIAR DA NOTA FISCAL/.test(t)) return "NFE";
  if (/BR\.GOV\.BCB\.PIX|PIX COPIA E COLA|LINHA DIGITAVEL|CODIGO DE BARRAS|FICHA DE COMPENSACAO/.test(t)) {
    return "PAGAMENTO";
  }
  if (/CONTRATO (PARTICULAR )?DE (COMPRA|VENDA)|INSTRUMENTO PARTICULAR DE (COMPRA|VENDA)/.test(t)) return "CONTRATO";
  return null;
}

/** "18/10/26" ou "18/10/2026" → "2026-10-18". */
function dataBrIso(texto: string | undefined): string | null {
  const m = (texto ?? "").match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}

/** CRC16-CCITT (0x1021, início 0xFFFF) — o dígito do "Pix copia e cola". */
function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** O código Pix lido está inteiro? (o CRC no fim confere com o resto) */
export function pixValido(codigo: string): boolean {
  if (!/^000201/.test(codigo) || codigo.length < 30) return false;
  return crc16(codigo.slice(0, -4)) === codigo.slice(-4).toUpperCase();
}

/**
 * Pix/boleto do pagamento pelo texto do PDF: valor, vencimento e o código para
 * pagar (Pix copia e cola — EMV terminado no CRC "6304XXXX" — ou a linha
 * digitável de 47/48 dígitos).
 */
export function pagamentoPeloTexto(texto: string): PagamentoLido | null {
  const corrido = texto.replace(/\s+/g, " ");
  const venc = corrido.match(/vencimento:?\s*(\d{2}\/\d{2}\/\d{2,4})/i)?.[1];
  const valores = [...corrido.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => Number(m[1].replace(/\./g, "").replace(",", ".")));
  // O código vem quebrado em linhas: junta as linhas, mas mantém os espaços
  // de dentro (o nome do recebedor faz parte do código e entra no CRC).
  const pixBruto = texto.replace(/[\r\n]+/g, "").match(/000201.*?6304[0-9A-F]{4}/i)?.[0] ?? null;
  const pix = pixBruto && pixValido(pixBruto) ? pixBruto : null;
  const linha =
    corrido
      .match(/(\d{5}[.\s]?\d{5}\s?\d{5}[.\s]?\d{6}\s?\d{5}[.\s]?\d{6}\s?\d\s?\d{14})/)?.[1]
      ?.replace(/\D/g, "") ?? null;
  const valor = valores.length ? Math.max(...valores) : null;
  if (!pix && !linha && valor == null) return null;
  return { valor, vencimento: dataBrIso(venc), pix, linhaDigitavel: linha };
}

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const placaKey = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** O que vai junto com os arquivos na hora de salvar (campo oculto do formulário). */
export type InfoDocsCompra = {
  /** Tipo de cada arquivo, na ordem em que foram escolhidos. */
  tipos: TipoDocCompra[];
  docOwnerName: string | null;
  crlvExercicio: string | null;
  nfe: NfeCompraLida | null;
  atpv: AtpvExtraido | null;
  pagamento: PagamentoLido | null;
};

export type CompraConsolidada = {
  /** Campos do cadastro (mesmo formato da leitura do contrato). */
  dados: ContratoExtraido;
  /** Vencimento do pagamento (aaaa-mm-dd), para o título da compra. */
  vencimento: string | null;
  info: InfoDocsCompra;
  /** Divergências entre os documentos — para conferir antes de salvar. */
  avisos: string[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Junta o que cada documento disse. Cada dado vem de quem é a fonte mais
 * confiável dele: o carro, do CRLV (depois ATPV-e, contrato, NF-e); o valor,
 * do contrato/NF-e (depois ATPV-e, pagamento); o vendedor, do contrato, da
 * NF-e (emitente), da ATPV-e e, por último, do proprietário no CRLV.
 */
export function consolidarCompra(lidos: DocCompraLido[], tipos: TipoDocCompra[]): CompraConsolidada {
  const um = <T extends DocCompraLido["tipo"]>(t: T) =>
    lidos.find((l): l is Extract<DocCompraLido, { tipo: T }> => l.tipo === t) ?? null;
  const crlv = um("CRLV")?.crlv ?? null;
  const atpv = um("ATPV")?.atpv ?? null;
  const nfe = um("NFE")?.nfe ?? null;
  const pagamento = um("PAGAMENTO")?.pagamento ?? null;
  const contrato = um("CONTRATO")?.contrato ?? null;
  const primeiro = <T>(...v: (T | null | undefined)[]): T | null => {
    for (const x of v) if (x !== null && x !== undefined && x !== "") return x;
    return null;
  };

  const dados: ContratoExtraido = {
    marca: primeiro(crlv?.marca, contrato?.marca),
    modelo: primeiro(crlv?.modelo, contrato?.modelo),
    versao: primeiro(contrato?.versao),
    anoFabricacao: primeiro(crlv?.anoFabricacao, contrato?.anoFabricacao),
    anoModelo: primeiro(crlv?.anoModelo, contrato?.anoModelo),
    placa: primeiro(crlv?.placa, atpv?.placa, contrato?.placa),
    chassi: primeiro(crlv?.chassi, atpv?.chassi, contrato?.chassi),
    renavam: primeiro(crlv?.renavam, atpv?.renavam, contrato?.renavam),
    cor: primeiro(crlv?.cor, contrato?.cor),
    combustivel: primeiro(crlv?.combustivel, contrato?.combustivel),
    transmissao: primeiro(crlv?.transmissao, contrato?.transmissao),
    km: primeiro(contrato?.km, atpv?.hodometro && atpv.hodometro > 0 ? atpv.hodometro : null),
    valorCompra: primeiro(contrato?.valorCompra, nfe?.valorTotal, atpv?.valorDeclarado, pagamento?.valor),
    vendedorNome: primeiro(contrato?.vendedorNome, nfe?.emitenteNome, atpv?.vendedorNome, crlv?.proprietario),
    vendedorDocumento: primeiro(
      contrato?.vendedorDocumento,
      nfe?.emitenteDocumento,
      atpv?.vendedorDocumento,
      crlv?.cpfCnpj,
    ),
    dataCompra: primeiro(contrato?.dataCompra, nfe?.emitidaEm),
  };

  const avisos: string[] = [];
  const placas = [crlv?.placa, atpv?.placa, contrato?.placa].map(placaKey).filter(Boolean);
  if (new Set(placas).size > 1) {
    avisos.push(`os documentos trazem placas diferentes (${[...new Set(placas)].join(", ")}) — confira se são do mesmo carro`);
  }
  const valores = [
    ["contrato", contrato?.valorCompra],
    ["NF-e", nfe?.valorTotal],
    ["ATPV-e", atpv?.valorDeclarado],
    ["pagamento", pagamento?.valor],
  ].filter((x): x is [string, number] => typeof x[1] === "number" && x[1] > 0);
  if (valores.length > 1 && valores.some(([, v]) => Math.abs(v - valores[0][1]) > 0.5)) {
    avisos.push(`valores diferentes entre os documentos: ${valores.map(([n, v]) => `${n} ${brl(v)}`).join(" · ")}`);
  }
  if (nfe?.chave && !chaveNfeValida(nfe.chave)) avisos.push("a chave da NF-e lida não confere — confira no Renave");

  const daChave = nfe?.chave && chaveNfeValida(nfe.chave) ? dadosDaChaveNfe(nfe.chave) : null;
  return {
    dados,
    vencimento: pagamento?.vencimento ?? null,
    avisos,
    info: {
      tipos,
      docOwnerName: crlv?.proprietario ?? null,
      crlvExercicio: crlv?.exercicio?.match(/\d{4}/)?.[0] ?? null,
      nfe: nfe
        ? {
            ...nfe,
            chave: nfe.chave && chaveNfeValida(nfe.chave) ? dig(nfe.chave) : null,
            numero: daChave?.numero ?? nfe.numero,
            serie: daChave?.serie ?? nfe.serie,
          }
        : null,
      atpv,
      pagamento,
    },
  };
}
