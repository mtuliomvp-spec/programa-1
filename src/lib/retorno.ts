/**
 * Retorno da financeira: comissão que o banco/financeira paga à loja quando a
 * venda é financiada. O nível vai de R-01 em diante (sem teto); cada nível vale
 * 1,2% do valor financiado (R-01 = 1,2%, R-02 = 2,4%, …). R-0 = sem retorno.
 * Sobre o retorno bruto a financeira retém um percentual de impostos — a loja
 * recebe o líquido.
 *
 * Módulo puro (sem "use server" / sem Prisma): usado no cliente (preview no
 * formulário de venda) e no servidor (registro da venda).
 */

export const RETORNO_RATE_PER_LEVEL = 0.012; // 1,2% por nível

export type RetornoBreakdown = { gross: number; tax: number; net: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula o retorno a partir do valor financiado, do nível (R-xx) e do
 * percentual de imposto retido pela financeira.
 */
export function computeReturn(
  financed: number,
  level: number,
  taxPercent: number,
): RetornoBreakdown {
  const lvl = Math.max(0, Math.floor(level || 0));
  const base = Math.max(0, financed || 0);
  if (lvl <= 0 || base <= 0) return { gross: 0, tax: 0, net: 0 };
  const gross = round2(base * lvl * RETORNO_RATE_PER_LEVEL);
  const tax = round2(gross * (Math.max(0, taxPercent || 0) / 100));
  const net = round2(gross - tax);
  return { gross, tax, net };
}

/** Rótulo "R-0X" (dois dígitos até 9, depois natural). */
export function retornoLabel(level: number): string {
  const lvl = Math.max(0, Math.floor(level || 0));
  return `R-${String(lvl).padStart(2, "0")}`;
}
