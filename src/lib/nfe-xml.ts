/**
 * Leitura do XML da NF-e — a fonte exata da nota.
 *
 * O PDF (DANFE) é uma REPRESENTAÇÃO da nota e precisa ser interpretado por IA,
 * que pode errar um dígito. O XML é o documento em si, gerado pelo emissor:
 * aqui os valores são lidos, não adivinhados. Quando o arquivo existe, é ele
 * que deve ser usado.
 *
 * Por que um leitor próprio e não uma biblioteca: o projeto tem só 10
 * dependências, e o que precisamos são meia dúzia de campos de texto simples
 * de um XML gerado por máquina e rigidamente padronizado (leiaute nacional da
 * NF-e). O escopo aqui é deliberadamente estreito — não é um parser de XML de
 * uso geral e não deve ser usado como tal.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Desfaz as entidades XML que aparecem em texto de nota (&amp;, &#233;…). */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** Conteúdo da PRIMEIRA ocorrência de `<tag>…</tag>`, ou null. */
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]).trim() || null : null;
}

/** Conteúdo de TODAS as ocorrências de `<tag>…</tag>`. */
function tagAll(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

const num = (v: string | null): number | null => {
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? round2(n) : null;
};

export type NfeXmlItem = {
  descricao: string;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type NfeXml = {
  numero: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  /** aaaa-mm-dd */
  emitidaEm: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  destinatarioNome: string | null;
  destinatarioCnpj: string | null;
  valorTotal: number | null;
  naturezaOperacao: string | null;
  /** Texto das informações complementares (onde costuma vir a forma de pagamento). */
  formaPagamento: string | null;
  itens: NfeXmlItem[];
};

/** Reconhece um arquivo de NF-e pelo conteúdo (não confia na extensão). */
export function looksLikeNfeXml(text: string): boolean {
  return /<infNFe[\s>]/.test(text) && /<emit[\s>]/.test(text);
}

/**
 * Extrai os campos que a solicitação de compra usa. Devolve `null` quando o
 * arquivo não é uma NF-e — aí o chamador cai no caminho da IA.
 */
export function parseNfeXml(text: string): NfeXml | null {
  if (!looksLikeNfeXml(text)) return null;

  const inf = text.match(/<infNFe\b[\s\S]*?<\/infNFe>/)?.[0] ?? text;
  // A chave está no atributo Id ("NFe" + 44 dígitos).
  const chave = inf.match(/\bId\s*=\s*"(?:NFe)?(\d{44})"/i)?.[1] ?? null;

  const ide = inf.match(/<ide\b[\s\S]*?<\/ide>/)?.[0] ?? "";
  const emit = inf.match(/<emit\b[\s\S]*?<\/emit>/)?.[0] ?? "";
  const dest = inf.match(/<dest\b[\s\S]*?<\/dest>/)?.[0] ?? "";
  const total = inf.match(/<ICMSTot\b[\s\S]*?<\/ICMSTot>/)?.[0] ?? "";
  const adic = inf.match(/<infAdic\b[\s\S]*?<\/infAdic>/)?.[0] ?? "";

  // dhEmi é ISO com fuso ("2026-08-07T14:39:56-03:00"); dEmi é só a data.
  const emissao = tag(ide, "dhEmi") ?? tag(ide, "dEmi");
  const emitidaEm = emissao?.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? emissao.slice(0, 10) : null;

  const itens: NfeXmlItem[] = [];
  for (const det of tagAll(inf, "det")) {
    const prod = det.match(/<prod\b[\s\S]*?<\/prod>/)?.[0] ?? det;
    const descricao = tag(prod, "xProd");
    if (!descricao) continue;
    itens.push({
      descricao,
      quantidade: num(tag(prod, "qCom")),
      valorUnitario: num(tag(prod, "vUnCom")),
      valorTotal: num(tag(prod, "vProd")),
    });
  }

  return {
    numero: tag(ide, "nNF"),
    serie: tag(ide, "serie"),
    chaveAcesso: chave,
    emitidaEm,
    emitenteNome: tag(emit, "xNome"),
    emitenteCnpj: tag(emit, "CNPJ") ?? tag(emit, "CPF"),
    destinatarioNome: tag(dest, "xNome"),
    destinatarioCnpj: tag(dest, "CNPJ") ?? tag(dest, "CPF"),
    valorTotal: num(tag(total, "vNF")),
    naturezaOperacao: tag(ide, "natOp"),
    formaPagamento: tag(adic, "infCpl"),
    itens,
  };
}
