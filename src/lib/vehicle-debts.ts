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
 *
 * ATENÇÃO — existem DOIS caminhos de débito no sistema, e eles são diferentes
 * de propósito. Não unifique:
 *
 *  1. AQUI (compra/troca): a dívida é do ANTIGO DONO. A loja desconta do que
 *     paga a ele e quita em seu lugar, então isso é parte do preço de
 *     aquisição — abate o líquido e NÃO vira `VehicleCost` (o valor já está
 *     dentro de `purchasePrice`; ver `isVehiclePurchase` em finance.ts).
 *
 *  2. `importVehicleDebtsAction` (consulta por placa, em estoque/actions.ts):
 *     o carro JÁ é da loja e o débito venceu com ele no pátio — IPVA do
 *     exercício seguinte, multa tomada em test drive. Aí é despesa da loja e
 *     vira `VehicleCost`, reduzindo a margem daquele carro.
 *
 * Um carro recebido em troca em novembro que atravessa o ano paga os dois: o
 * IPVA do ano anterior pelo caminho 1 e o do ano seguinte pelo caminho 2. Não
 * é dupla contagem — são dois fatos econômicos distintos.
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

/**
 * Diferença entre as guias reais (linhas) e o total ACORDADO com o antigo dono.
 *
 * Positiva = as guias vieram maiores do que o descontado: a loja paga a mais e
 * isso é custo do veículo. Negativa = vieram menores: sobra, e o carro custou
 * menos. Sem detalhamento, `diff` é 0 (nada a ajustar).
 */
export function debtsDiff(agreed: number, items: unknown): { real: number; diff: number } {
  const list = parseDebtItems(items);
  if (!list.length) return { real: 0, diff: 0 };
  const real = round2(list.reduce((s, d) => s + d.amount, 0));
  return { real, diff: round2(real - (agreed || 0)) };
}

/** Descrição-marca do custo de ajuste — é por ela que ele é apagado e recriado. */
export const AJUSTE_DEBITOS_DESC = "Ajuste de débitos (guias × acordado)";

/** Mesmo papel para a QUITAÇÃO: boleto real × valor acordado com o vendedor. */
export const AJUSTE_QUITACAO_DESC = "Ajuste de quitação (boleto × acordado)";
