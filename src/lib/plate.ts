/**
 * Placa do veículo: normalização e equivalência entre o padrão ANTIGO
 * (LLLNNNN, ex.: PSK4673) e o MERCOSUL (LLLNLNN, ex.: PSK4G73).
 *
 * Na troca para Mercosul a placa NÃO é sorteada de novo: o 5º caractere (o 2º
 * dígito) vira a letra correspondente ao próprio número — 0→A, 1→B, 2→C, 3→D,
 * 4→E, 5→F, 6→G, 7→H, 8→I, 9→J. Só isso muda; o resto é idêntico.
 *
 * Ou seja, PSK4673 e PSK4G73 são O MESMO CARRO. O sistema precisa saber disso
 * em três lugares:
 *  1. leitura do CRLV (o documento novo vem em Mercosul, a ficha pode estar na
 *     placa antiga — não é "outro carro");
 *  2. trava de placa duplicada (cadastrar a Mercosul de um carro que já está no
 *     estoque com a antiga seria uma segunda ficha do mesmo veículo);
 *  3. buscas — procurar pela placa antiga tem de achar os lançamentos feitos
 *     depois da troca, e vice-versa.
 *
 * A tabela pode mudar no futuro (é convenção do DENATRAN, não lei da física);
 * está isolada aqui de propósito.
 *
 * Arquivo puro (sem `server-only`): usado em formulário, actions e páginas.
 */

/** Dígito → letra na conversão para Mercosul (posição 5 da placa). */
const DIGIT_TO_LETTER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

/** Letra → dígito (o caminho inverso, para reconstruir a placa antiga). */
const LETTER_TO_DIGIT: Record<string, string> = Object.fromEntries(
  DIGIT_TO_LETTER.map((letter, digit) => [letter, String(digit)]),
);

/** Placa comparável: maiúsculas, só letras e números (sem hífen nem espaço). */
export function plateKey(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const OLD_FORMAT = /^[A-Z]{3}\d{4}$/;
const MERCOSUL_FORMAT = /^[A-Z]{3}\d[A-Z]\d{2}$/;

/**
 * Forma MERCOSUL da placa — é a canônica, porque é para onde toda placa
 * brasileira caminha. Placa que não estiver em nenhum dos dois formatos volta
 * normalizada (sem inventar conversão).
 */
export function plateToMercosul(value: string | null | undefined): string {
  const key = plateKey(value);
  if (!OLD_FORMAT.test(key)) return key;
  return key.slice(0, 4) + DIGIT_TO_LETTER[Number(key[4])] + key.slice(5);
}

/** Forma ANTIGA da placa (o caminho inverso). Vazio quando não se aplica. */
export function plateToOld(value: string | null | undefined): string {
  const key = plateKey(value);
  if (!MERCOSUL_FORMAT.test(key)) return OLD_FORMAT.test(key) ? key : "";
  const digit = LETTER_TO_DIGIT[key[4]];
  return digit === undefined ? "" : key.slice(0, 4) + digit + key.slice(5);
}

/**
 * Chave de IDENTIDADE da placa: as duas grafias do mesmo carro devolvem o mesmo
 * valor. É por ela que se compara "é o mesmo veículo?" — em vez de `plateKey`,
 * que trata PSK4673 e PSK4G73 como carros diferentes.
 */
export function plateIdentityKey(value: string | null | undefined): string {
  return plateToMercosul(value);
}

/** As duas grafias conhecidas da placa (sem repetir), para busca e exibição. */
export function plateVariants(value: string | null | undefined): string[] {
  const key = plateKey(value);
  if (!key) return [];
  const out = new Set<string>([key]);
  const mercosul = plateToMercosul(key);
  if (mercosul) out.add(mercosul);
  const old = plateToOld(key);
  if (old) out.add(old);
  return [...out];
}

/** As duas grafias são o mesmo veículo? */
export function isSamePlate(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = plateIdentityKey(a);
  const kb = plateIdentityKey(b);
  return !!ka && ka === kb;
}
