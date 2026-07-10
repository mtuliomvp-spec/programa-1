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

function tagValue(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return match?.[1]?.trim() || undefined;
}

function parseOfxDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseOfxAmount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseFloat(value.replace(",", "."));
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
