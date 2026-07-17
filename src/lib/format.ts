/** Número da solicitação de compra por ano: 0001/2026. */
export function formatRequestNumber(seq: number, year: number): string {
  return `${String(seq).padStart(4, "0")}/${year}`;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function toDateInputValue(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function parseDateInput(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}
