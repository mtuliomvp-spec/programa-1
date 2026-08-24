/**
 * Matemática da simulação de financiamento (Tabela Price).
 *
 * Arquivo PURO — sem prisma e sem server-only — porque a mesma conta roda no
 * servidor (para o resumo do anúncio) e no navegador do cliente que está
 * mexendo nos controles da vitrine.
 *
 * O que sai daqui é ESTIMATIVA: não entram IOF, tarifa de cadastro, seguros
 * nem o spread que a financeira aplica ao perfil do cliente. Por isso toda
 * tela que usa este cálculo tem de exibir o aviso de que não é oferta de
 * crédito (CDC, art. 52).
 */

export type SimulationInput = {
  /** Preço do veículo. */
  price: number;
  /** Entrada dada pelo cliente. */
  downPayment: number;
  /** Número de parcelas. */
  months: number;
  /** Taxa de juros ao mês, em porcentagem (ex.: 1.79 = 1,79% a.m.). */
  monthlyRatePercent: number;
};

export type Simulation = {
  financed: number;
  installment: number;
  total: number;
  totalWithDown: number;
  interest: number;
  monthlyRatePercent: number;
  yearlyRatePercent: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Parcela pela Tabela Price: PMT = PV × i ÷ (1 − (1+i)^−n).
 * Com juros zero, é a divisão simples do valor pelas parcelas.
 */
export function pmt(presentValue: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRate <= 0) return presentValue / months;
  const fator = Math.pow(1 + monthlyRate, -months);
  return (presentValue * monthlyRate) / (1 - fator);
}

/** Taxa anual equivalente (juros compostos) a partir da mensal. */
export function yearlyFromMonthly(monthlyRatePercent: number): number {
  return (Math.pow(1 + monthlyRatePercent / 100, 12) - 1) * 100;
}

export function simulate(input: SimulationInput): Simulation {
  const price = Math.max(0, input.price);
  const downPayment = Math.min(Math.max(0, input.downPayment), price);
  const financed = round2(price - downPayment);
  const months = Math.max(1, Math.round(input.months));
  const monthlyRatePercent = Math.max(0, input.monthlyRatePercent);

  const installment = round2(pmt(financed, monthlyRatePercent / 100, months));
  const total = round2(installment * months);

  return {
    financed,
    installment,
    total,
    totalWithDown: round2(total + downPayment),
    interest: round2(total - financed),
    monthlyRatePercent,
    yearlyRatePercent: round2(yearlyFromMonthly(monthlyRatePercent)),
  };
}

/** Prazos oferecidos na vitrine, limitados ao máximo da financeira. */
export const PRAZOS_PADRAO = [12, 24, 36, 48, 60] as const;

export function prazosAte(maxInstallments: number): number[] {
  const lista = PRAZOS_PADRAO.filter((p) => p <= maxInstallments);
  return lista.length > 0 ? [...lista] : [maxInstallments];
}

/**
 * Aviso obrigatório da simulação. Fica aqui (e não solto na tela) para não
 * existirem duas versões do texto: quem oferta crédito é a instituição
 * financeira, não a loja.
 */
export const SIMULATOR_DISCLAIMER =
  "Simulação estimativa, não é oferta de crédito. O valor final depende de análise " +
  "da instituição financeira e do perfil do cliente. Não inclui IOF, tarifas, seguros " +
  "ou outros encargos — o custo efetivo total (CET) é informado pela financeira na proposta.";
