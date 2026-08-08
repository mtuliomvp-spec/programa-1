/** Calcula o status "efetivo" de uma conta, marcando como atrasada quando o
 * vencimento já passou e ela ainda está pendente — sem precisar de um job
 * agendado para atualizar o banco. */

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function effectivePayableStatus(
  status: "PENDENTE" | "PAGO" | "ATRASADO",
  dueDate: Date,
): "PENDENTE" | "PAGO" | "ATRASADO" {
  if (status === "PAGO") return "PAGO";
  return dueDate < startOfToday() ? "ATRASADO" : "PENDENTE";
}

export function effectiveReceivableStatus(
  status: "PENDENTE" | "RECEBIDO" | "ATRASADO",
  dueDate: Date,
): "PENDENTE" | "RECEBIDO" | "ATRASADO" {
  if (status === "RECEBIDO") return "RECEBIDO";
  return dueDate < startOfToday() ? "ATRASADO" : "PENDENTE";
}

/** Dias de antecedência do aviso de vencimento da aplicação. */
export const MATURITY_WARN_DAYS = 7;

export type MaturityStatus = "sem-data" | "ok" | "proximo" | "vencido";

/**
 * Situação do vencimento de uma aplicação, pela mesma régua do "atrasado" dos
 * títulos (startOfToday, em UTC) — sem job agendado.
 *
 * "proximo" começa `days` dias antes: é a janela para reaplicar antes de o
 * dinheiro ficar parado sem render.
 */
export function maturityStatus(
  maturity: Date | string | null | undefined,
  days = MATURITY_WARN_DAYS,
): MaturityStatus {
  if (!maturity) return "sem-data";
  const date = typeof maturity === "string" ? new Date(maturity) : maturity;
  const today = startOfToday();
  if (date < today) return "vencido";
  const limit = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  return date <= limit ? "proximo" : "ok";
}

/** Dias que faltam para vencer (negativo = já venceu). */
export function daysToMaturity(maturity: Date | string): number {
  const date = typeof maturity === "string" ? new Date(maturity) : maturity;
  const diff = date.getTime() - startOfToday().getTime();
  return Math.round(diff / (24 * 60 * 60 * 1000));
}
