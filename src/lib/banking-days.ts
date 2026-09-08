/**
 * Dias úteis bancários e feriados nacionais.
 *
 * Existe por causa do DESCONTO do boleto: "desconto até o vencimento" não morre
 * no sábado. Vencimento que cai em sábado, domingo ou feriado é pagável — com o
 * mesmo desconto — no PRIMEIRO DIA ÚTIL seguinte; é como o banco processa e é o
 * que o beneficiário aceita. Sem isso o sistema cobrava o valor cheio de um
 * boleto ainda no prazo (ex.: vence sábado 05/09, feriado na segunda 07/09,
 * pago na terça 08/09 — ainda com desconto).
 *
 * Só feriados NACIONAIS entram: são os que valem em todo o país. Feriado
 * estadual/municipal (em São Luís, por exemplo, 08/09 — Adesão do Maranhão)
 * apenas ESTICARIA o prazo mais um dia, então ficar de fora nunca faz o sistema
 * conceder um desconto que não existe — no máximo deixa de esticar. Datas
 * móveis saem da Páscoa, calculada aqui.
 *
 * Arquivo puro (sem banco, sem `server-only`): usado no servidor e no cliente.
 */

/** Chave yyyy-mm-dd em UTC (as datas do sistema são gravadas em UTC). */
function chave(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function somaDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * 86400000);
}

/**
 * Domingo de Páscoa do ano (algoritmo de Meeus/Butcher, calendário gregoriano).
 * É a âncora do Carnaval, da Sexta-feira Santa e de Corpus Christi.
 */
export function domingoDePascoa(year: number): Date {
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
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, mes, dia);
}

/** Feriados nacionais do ano, como chaves yyyy-mm-dd. */
export function feriadosNacionais(year: number): Set<string> {
  const pascoa = domingoDePascoa(year);
  const datas = [
    utc(year, 1, 1), // Confraternização Universal
    somaDias(pascoa, -48), // Carnaval (segunda)
    somaDias(pascoa, -47), // Carnaval (terça)
    somaDias(pascoa, -2), // Sexta-feira Santa
    utc(year, 4, 21), // Tiradentes
    utc(year, 5, 1), // Dia do Trabalho
    somaDias(pascoa, 60), // Corpus Christi
    utc(year, 9, 7), // Independência
    utc(year, 10, 12), // Nossa Senhora Aparecida
    utc(year, 11, 2), // Finados
    utc(year, 11, 15), // Proclamação da República
    utc(year, 11, 20), // Consciência Negra (nacional desde 2024, Lei 14.759/2023)
    utc(year, 12, 25), // Natal
  ];
  return new Set(datas.map(chave));
}

/** Dia útil bancário: não é sábado, domingo nem feriado nacional. */
export function isDiaUtilBancario(date: Date): boolean {
  const dia = date.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !feriadosNacionais(date.getUTCFullYear()).has(chave(date));
}

/**
 * A própria data, quando é dia útil; senão o primeiro dia útil seguinte.
 * Limitado a 10 dias para nunca entrar em laço infinito.
 */
export function proximoDiaUtil(date: Date): Date {
  let d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  for (let i = 0; i < 10 && !isDiaUtilBancario(d); i++) {
    d = somaDias(d, 1);
  }
  return d;
}

/**
 * Prazo efetivo de um boleto: a data limite empurrada para o primeiro dia útil
 * quando cai em fim de semana ou feriado. Null entra, null sai.
 */
export function prazoEfetivo(limite: Date | null | undefined): Date | null {
  if (!limite) return null;
  return proximoDiaUtil(limite);
}

/**
 * O pagamento nesta data ainda pega o prazo? Compara só o DIA (as horas do
 * registro não podem decidir se o desconto vale).
 */
export function dentroDoPrazo(pagamento: Date, limite: Date | null | undefined): boolean {
  const prazo = prazoEfetivo(limite);
  if (!prazo) return false;
  const dia = Date.UTC(pagamento.getUTCFullYear(), pagamento.getUTCMonth(), pagamento.getUTCDate());
  return dia <= prazo.getTime();
}
