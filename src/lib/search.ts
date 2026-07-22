/**
 * Busca textual das listagens: o usuário digita termos livres (?q=) e a página
 * filtra as linhas já carregadas comparando com os campos EXIBIDOS. Cada termo
 * digitado precisa aparecer em algum campo (E entre termos, OU entre campos);
 * acentos e maiúsculas são ignorados ("jose" acha "José").
 */

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
  const haystack = normalizeSearch(
    fields
      .filter((f) => f !== null && f !== undefined && f !== "")
      .map(String)
      .join(" "),
  );
  return normalizeSearch(query)
    .split(/\s+/)
    .every((term) => haystack.includes(term));
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
