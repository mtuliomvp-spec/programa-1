/**
 * Parser simples de extratos OFX (formato exportado pelos bancos
 * brasileiros). OFX é um SGML frouxo, então extraímos as transações
 * (<STMTTRN>) com expressões regulares tolerantes.
 */

export type OfxTransaction = {
  fitId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // negativo = saída, positivo = entrada
  memo: string;
  type: string;
};

/**
 * Descobre a codificação declarada no cabeçalho do arquivo. OFX 1.x traz
 * `ENCODING:`/`CHARSET:` em linhas de texto puro; OFX 2.x é XML e traz
 * `encoding="..."` na declaração.
 */
function declaredCharset(header: string): string | undefined {
  const xml = header.match(/<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i);
  if (xml) return xml[1].toLowerCase();

  const encoding = header.match(/^\s*ENCODING:\s*([\w-]+)/im)?.[1]?.toUpperCase();
  const charset = header.match(/^\s*CHARSET:\s*([\w-]+)/im)?.[1]?.toUpperCase();

  if (encoding === "UTF-8") return "utf-8";
  // USASCII + CHARSET é o combo dos bancos brasileiros: o CHARSET é quem manda.
  if (charset === "1252" || charset === "WINDOWS-1252") return "windows-1252";
  if (charset === "8859-1" || charset === "ISO-8859-1" || charset === "LATIN1") return "iso-8859-1";
  return undefined;
}

/**
 * Converte os bytes do arquivo em texto respeitando a codificação do banco.
 * `File.text()` decodifica SEMPRE como UTF-8, e extratos em Latin-1/Windows-1252
 * (o padrão do BB, Bradesco e Santander) perdem os acentos de forma
 * irreversível — "TRANSFERÊNCIA" vira "TRANSFER<?>NCIA". Por isso lemos os
 * bytes e escolhemos o decodificador: o declarado no cabeçalho e, na falta
 * dele, UTF-8 com queda para Windows-1252 se aparecer caractere inválido.
 */
export function decodeOfx(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // O cabeçalho é sempre ASCII — ler como latin1 nunca falha.
  const header = new TextDecoder("latin1").decode(buf.subarray(0, 2048));
  const declared = declaredCharset(header);
  if (declared) {
    try {
      return new TextDecoder(declared).decode(buf);
    } catch {
      // Codificação exótica/desconhecida: cai na detecção automática abaixo.
    }
  }
  const utf8 = new TextDecoder("utf-8").decode(buf);
  // U+FFFD ("caractere de substituição") = os bytes não eram UTF-8.
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** OFX 2.x é XML: `&amp;`, `&#233;` e `&#xE9;` precisam voltar ao texto original. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#")) {
      const num = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) && num > 0 ? String.fromCodePoint(num) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function tagValue(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  const raw = match?.[1]?.trim();
  return raw ? decodeEntities(raw) : undefined;
}

function parseOfxDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Valor da transação. O padrão OFX usa ponto decimal, mas há bancos que exportam
 * no formato brasileiro ("1.234,56") — nesse caso o ÚLTIMO separador é o decimal
 * e o outro é separador de milhar (que precisa sair, senão 1.234,56 vira 1,23).
 */
function parseOfxAmount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  let text = value.replace(/[\s ]/g, "");
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    text = text.slice(0, decimalAt).replace(/[.,]/g, "") + "." + text.slice(decimalAt + 1);
  } else if (lastComma >= 0) {
    text = text.replace(",", ".");
  }
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOfx(content: string): OfxTransaction[] {
  const transactions: OfxTransaction[] = [];
  const blocks = content.match(/<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>))/gi) || [];

  for (const block of blocks) {
    const date = parseOfxDate(tagValue(block, "DTPOSTED"));
    const amount = parseOfxAmount(tagValue(block, "TRNAMT"));
    if (!date || amount === undefined || amount === 0) continue;
    const memo =
      tagValue(block, "MEMO") || tagValue(block, "NAME") || tagValue(block, "PAYEE") || "Sem descrição";
    const fitId = tagValue(block, "FITID") || `${date}-${amount}-${memo.slice(0, 16)}`;
    transactions.push({
      fitId,
      date,
      amount,
      memo,
      type: tagValue(block, "TRNTYPE") || (amount < 0 ? "DEBIT" : "CREDIT"),
    });
  }

  // remove duplicados por FITID
  const seen = new Set<string>();
  return transactions.filter((t) => {
    if (seen.has(t.fitId)) return false;
    seen.add(t.fitId);
    return true;
  });
}
