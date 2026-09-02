/**
 * Nome de exibição de veículo para a vitrine (marca, modelo e versão), sem
 * as repetições que vêm do cadastro — funções puras, sem banco.
 */

// Siglas de marca/modelo que ficam em MAIÚSCULAS na exibição.
const SIGLAS = new Set(["vw", "gm", "bmw", "byd", "jac", "gwm", "ram", "kia", "mini", "jeep", "ma"]);
const MINUSCULAS = new Set(["de", "da", "do", "e"]);

function palavras(texto: string | null | undefined): string[] {
  return String(texto || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function igual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** `seq` aparece inteira, em sequência, dentro de `lista`? */
function contemSequencia(lista: string[], seq: string[]): boolean {
  if (seq.length === 0 || seq.length > lista.length) return false;
  for (let i = 0; i + seq.length <= lista.length; i++) {
    if (seq.every((w, j) => igual(lista[i + j], w))) return true;
  }
  return false;
}

/**
 * Tira de `parte` o que já está no fim de `acumulado`: "polo track ma" +
 * "ma" → "" ; "polo track" + "track ma" → "ma". Se a parte inteira já apareceu
 * no acumulado ("polo track ma" + "polo track"), some por completo.
 */
function semRepeticao(acumulado: string[], parte: string[]): string[] {
  if (parte.length === 0) return [];
  if (contemSequencia(acumulado, parte)) return [];
  const max = Math.min(acumulado.length, parte.length);
  for (let k = max; k >= 1; k--) {
    const cauda = acumulado.slice(acumulado.length - k);
    const cabeca = parte.slice(0, k);
    if (cauda.every((w, i) => igual(w, cabeca[i]))) return parte.slice(k);
  }
  return parte;
}

/**
 * Junta as partes (marca, modelo, versão…) ignorando o que uma repete da
 * anterior — o cadastro costuma ter "Polo Track MA" no modelo e "MA" na
 * versão, e o anúncio saía "Polo Track MA MA". Palavra repetida em seguida
 * também some ("Uno Uno" → "Uno").
 */
export function juntarSemRepetir(...parts: (string | null | undefined)[]): string[] {
  const acumulado: string[] = [];
  for (const parte of parts) {
    for (const w of semRepeticao(acumulado, palavras(parte))) {
      if (acumulado.length > 0 && igual(acumulado[acumulado.length - 1], w)) continue;
      acumulado.push(w);
    }
  }
  return acumulado;
}

function formatarPalavra(w: string): string {
  const low = w.toLowerCase();
  if (SIGLAS.has(low)) return w.toUpperCase();
  if (MINUSCULAS.has(low)) return low;
  if (/\d/.test(w) && w.length <= 4) return w.toUpperCase(); // hb20, s10, c4
  return w
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join("-");
}

/**
 * Nome de exibição padronizado para a vitrine: "vw polo track ma" →
 * "VW Polo Track MA". Siglas conhecidas e palavras com número ficam em
 * maiúsculas (HB20, T-CROSS não: só o dígito força caixa alta da palavra
 * curta); o resto vira Inicial Maiúscula. Partes que repetem a anterior são
 * ignoradas. Não altera o dado cadastrado.
 */
export function displayName(...parts: (string | null | undefined)[]): string {
  return juntarSemRepetir(...parts).map(formatarPalavra).join(" ");
}

/**
 * Versão como aparece na linha de baixo do anúncio: só o que ela acrescenta
 * a marca + modelo. Null quando a versão não acrescenta nada (ex.: modelo
 * "Polo Track MA", versão "MA").
 */
export function displayVersion(
  brand: string | null | undefined,
  model: string | null | undefined,
  version: string | null | undefined,
): string | null {
  const base = juntarSemRepetir(brand, model);
  const extra = semRepeticao(base, palavras(version));
  if (extra.length === 0) return null;
  return extra.map(formatarPalavra).join(" ");
}
