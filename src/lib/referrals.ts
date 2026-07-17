/**
 * Indicações de venda ("Indicação de Venda"): quem indicou a negociação e o
 * valor pago pela indicação. Ficam gravadas como JSON ([{ name, amount }]) na
 * pré-venda e na venda; cada indicação com valor vira uma conta a pagar
 * (categoria Comissão) ao registrar a venda — mesmo ciclo da comissão do
 * vendedor. Módulo em src/lib porque tanto o app quanto os relatórios usam.
 */

export type SaleReferral = { name: string; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Converte o JSON gravado (Prisma.JsonValue) ou a string serializada do
 * formulário em uma lista limpa de indicações: nome com trim, valor
 * arredondado em 2 casas e nunca negativo. Entradas sem nome e sem valor são
 * descartadas; qualquer entrada inválida (JSON quebrado, formato inesperado)
 * vira lista vazia — nunca lança.
 */
export function parseReferrals(value: unknown): SaleReferral[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const result: SaleReferral[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { name, amount } = item as { name?: unknown; amount?: unknown };
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanAmount = Math.max(0, round2(Number(amount) || 0));
    if (!cleanName && cleanAmount <= 0) continue;
    result.push({ name: cleanName, amount: cleanAmount });
  }
  return result;
}

/** Soma dos valores das indicações (2 casas). Aceita o mesmo input do parse. */
export function sumReferrals(value: unknown): number {
  return round2(parseReferrals(value).reduce((sum, r) => sum + r.amount, 0));
}
