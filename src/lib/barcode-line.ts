/**
 * Linha digitável do código de barras (boleto bancário ou guia de
 * concessionária/órgão). Funções puras — usadas na leitura por IA, na edição
 * manual do título e na Ordem de Pagamento.
 *
 * O que interessa é o que a pessoa cola no leitor do banco: por isso guardamos
 * a linha FORMATADA (com pontos e espaços, como impressa) e comparamos/validamos
 * pelos dígitos.
 */

/** Só os dígitos da linha (é como o banco compara). */
export function barcodeDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

/**
 * Linha digitável plausível? Boleto bancário tem 47 dígitos; guia de
 * concessionária/tributo (começa com 8), 48. Aceita 44 (código de barras puro,
 * sem os dígitos verificadores da linha) para não recusar o que o usuário colou
 * do aplicativo do banco.
 */
export function isBarcodeLine(value: string | null | undefined): boolean {
  const n = barcodeDigits(value).length;
  return n === 44 || n === 47 || n === 48;
}

/**
 * Normaliza para guardar: mantém dígitos, pontos e espaços (a grafia impressa),
 * colapsa espaços e devolve null quando não é uma linha digitável.
 */
export function normalizeBarcodeLine(value: string | null | undefined): string | null {
  const raw = (value || "").replace(/\s+/g, " ").trim();
  if (!raw || !isBarcodeLine(raw)) return null;
  return raw;
}

/** Primeira linha digitável válida de uma lista (leituras com vários boletos). */
export function linhaDigitavelValida(values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const linha = normalizeBarcodeLine(v);
    if (linha) return linha;
  }
  return null;
}

/**
 * Agrupa a linha em blocos de 5 dígitos para leitura na tela/PDF quando ela vem
 * sem formatação nenhuma (só números). Com pontos/espaços, devolve como está.
 */
export function formatBarcodeLine(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (/[.\s]/.test(raw)) return raw;
  return raw.replace(/(\d{5})(?=\d)/g, "$1 ").trim();
}
