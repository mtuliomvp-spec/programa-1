/**
 * O campo "Search Console" de Parâmetros aceita os dois métodos de
 * verificação do Google: o código da meta tag ou o NOME do arquivo HTML
 * ("google1a2b3c….html"). Esta função diz se o valor é um arquivo.
 */
export const ARQUIVO_GOOGLE_RE = /^google[0-9a-f]{8,32}\.html$/i;

export function arquivoDeVerificacaoGoogle(valor: string | null | undefined): string | null {
  const v = (valor || "").trim();
  return ARQUIVO_GOOGLE_RE.test(v) ? v.toLowerCase() : null;
}
