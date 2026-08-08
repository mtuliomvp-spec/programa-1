/**
 * Detalhamento dos débitos do veículo (IPVA, multas, licenciamento).
 *
 * O campo "Débitos do veículo" é um total que abate a entrada da troca / o
 * líquido ao vendedor, e virava UM único título a pagar. Mas dentro dele há
 * dívidas de credores e vencimentos diferentes — daí o detalhamento, que
 * transforma o mesmo total em N títulos.
 *
 * O total continua sendo a fonte de verdade das contas (é ele que entra nas
 * fórmulas de líquido); estas linhas são a explicação dele. Guardadas como JSON
 * no veículo e na pré-venda, no mesmo molde de `src/lib/referrals.ts`.
 */

export type VehicleDebtItem = {
  description: string;
  amount: number;
  /** yyyy-mm-dd. Vazio = usa o vencimento da compra. */
  dueDate: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Converte o JSON gravado ou a string do formulário numa lista limpa. Linha
 * sem descrição e sem valor é descartada; entrada inválida vira lista vazia —
 * nunca lança.
 */
export function parseDebtItems(value: unknown): VehicleDebtItem[] {
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
  const result: VehicleDebtItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { description, amount, dueDate } = item as {
      description?: unknown;
      amount?: unknown;
      dueDate?: unknown;
    };
    const cleanDescription = typeof description === "string" ? description.trim() : "";
    const cleanAmount = Math.max(0, round2(Number(amount) || 0));
    if (!cleanDescription && cleanAmount <= 0) continue;
    const rawDue = typeof dueDate === "string" ? dueDate.trim() : "";
    result.push({
      description: cleanDescription,
      amount: cleanAmount,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null,
    });
  }
  return result;
}

/** Soma das linhas (2 casas). Aceita o mesmo input do parse. */
export function sumDebtItems(value: unknown): number {
  return round2(parseDebtItems(value).reduce((sum, d) => sum + d.amount, 0));
}
