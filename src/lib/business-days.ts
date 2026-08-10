/**
 * Dias úteis para vencimento de guias (impostos): sábado, domingo e feriado
 * nacional não contam. Feriados móveis (Carnaval, Sexta-feira Santa e Corpus
 * Christi) são calculados a partir da Páscoa — nesses dias os bancos não
 * funcionam, então a guia também é antecipada.
 *
 * Todas as datas trabalham em UTC (o padrão do sistema: vencimentos ficam no
 * meio-dia UTC e a exibição usa o dia UTC).
 */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como {month, day} 1-based. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const holidayCache = new Map<number, Set<string>>();

const mmdd = (month: number, day: number) =>
  `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Conjunto "mm-dd" dos feriados nacionais do ano (fixos + móveis). */
function nationalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const set = new Set<string>([
    mmdd(1, 1), // Confraternização Universal
    mmdd(4, 21), // Tiradentes
    mmdd(5, 1), // Dia do Trabalho
    mmdd(9, 7), // Independência
    mmdd(10, 12), // Nossa Senhora Aparecida
    mmdd(11, 2), // Finados
    mmdd(11, 15), // Proclamação da República
    mmdd(11, 20), // Consciência Negra (nacional desde 2024)
    mmdd(12, 25), // Natal
  ]);

  // Móveis a partir da Páscoa: Carnaval (seg/ter, 48/47 dias antes),
  // Sexta-feira Santa (2 dias antes) e Corpus Christi (60 dias depois).
  const easter = easterSunday(year);
  const easterUtc = Date.UTC(year, easter.month - 1, easter.day, 12);
  for (const offset of [-48, -47, -2, 60]) {
    const d = new Date(easterUtc + offset * 24 * 60 * 60 * 1000);
    set.add(mmdd(d.getUTCMonth() + 1, d.getUTCDate()));
  }

  holidayCache.set(year, set);
  return set;
}

/** Dia útil = não é sábado/domingo nem feriado nacional (pelo dia UTC). */
export function isBusinessDay(date: Date): boolean {
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !nationalHolidays(date.getUTCFullYear()).has(
    mmdd(date.getUTCMonth() + 1, date.getUTCDate()),
  );
}

/**
 * Antecipa para o último dia útil: se a data já é útil, devolve ela mesma;
 * senão volta dia a dia até encontrar um dia útil (padrão das guias — DAS,
 * FGTS e DARF vencem no dia útil ANTERIOR ao fim de semana/feriado).
 */
export function previousBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (!isBusinessDay(d)) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
