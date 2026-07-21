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

/**
 * Número inteiro por extenso (0–999), para dar clareza jurídica nos contratos
 * (ex.: "48 (quarenta e oito) parcelas"). Fora do intervalo, devolve o numeral.
 */
export function numeroExtenso(n: number): string {
  const x = Math.round(n);
  if (x < 0 || x > 999) return String(x);
  if (x === 0) return "zero";
  if (x === 100) return "cem";
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dez10a19 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const parts: string[] = [];
  const c = Math.floor(x / 100);
  const resto = x % 100;
  if (c > 0) parts.push(centenas[c]);
  if (resto > 0) {
    if (resto < 10) parts.push(unidades[resto]);
    else if (resto < 20) parts.push(dez10a19[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      parts.push(u > 0 ? `${dezenas[d]} e ${unidades[u]}` : dezenas[d]);
    }
  }
  return parts.join(" e ");
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
