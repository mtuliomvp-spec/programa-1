/**
 * Busca textual das listagens: o usuário digita termos livres (?q=) e a página
 * filtra as linhas já carregadas comparando com os campos EXIBIDOS. Cada termo
 * digitado precisa aparecer em algum campo (E entre termos, OU entre campos);
 * acentos e maiúsculas são ignorados ("jose" acha "José").
 */

import { plateVariants } from "@/lib/plate";

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchesSearch(
  q: string | undefined,
  ...fields: (string | number | null | undefined)[]
): boolean {
  const query = (q || "").trim();
  if (!query) return true;
  const raw = fields.filter((f) => f !== null && f !== undefined && f !== "").map(String);
  // Placa Mercosul: PSK4673 e PSK4G73 são o MESMO carro (o 2º dígito virou
  // letra). Toda placa que aparece nos campos entra no palheiro nas DUAS
  // grafias, então procurar por qualquer uma acha os lançamentos de antes e
  // depois da troca — inclusive nos textos ("Venda do veículo ... placa X").
  const haystack = normalizeSearch([...raw, ...plateSpellings(raw.join(" "))].join(" "));
  return normalizeSearch(query)
    .split(/\s+/)
    // O termo digitado também é expandido: quem procura a grafia que não está
    // gravada (ex.: a antiga, num registro já atualizado) continua achando.
    .every((term) => haystack.includes(term) || plateSpellings(term).some((v) => haystack.includes(normalizeSearch(v))));
}

/**
 * Todas as grafias de placa encontradas num texto (a antiga e a Mercosul).
 * Trabalha sobre o texto cru: as placas aparecem soltas ("PSK4G73") ou dentro
 * de descrições ("... - placa PSK4G73").
 */
function plateSpellings(text: string): string[] {
  const out: string[] = [];
  for (const match of text.toUpperCase().matchAll(/\b[A-Z]{3}\d[A-Z0-9]\d{2}\b/g)) {
    out.push(...plateVariants(match[0]));
  }
  return out;
}

/** Data (Date ou ISO) dentro do intervalo `de`/`ate` (yyyy-mm-dd), inclusivo. */
export function inDateRange(
  date: Date | string | null | undefined,
  de?: string,
  ate?: string,
): boolean {
  const from = (de || "").trim();
  const to = (ate || "").trim();
  if (!from && !to) return true;
  if (!date) return false;
  // Compara pelo dia (yyyy-mm-dd) no fuso local, ignorando a hora.
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return false;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Converte texto de valor ("1.234,50", "1234.5") em número, ou null. */
function parseAmount(v: string | undefined): number | null {
  const s = (v || "").trim();
  if (!s) return null;
  // Remove separador de milhar e troca vírgula decimal por ponto.
  const norm = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Valor numérico dentro da faixa `min`/`max`, inclusivo; vazio = passa. */
export function inValueRange(value: number, min?: string, max?: string): boolean {
  const lo = parseAmount(min);
  const hi = parseAmount(max);
  if (lo !== null && value < lo) return false;
  if (hi !== null && value > hi) return false;
  return true;
}
