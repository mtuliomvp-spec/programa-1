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
