/**
 * Permissão GRANULAR de cada anexo do veículo (módulo "estoque"): cada card da
 * ficha tem a sua, para o administrador decidir quem faz o quê.
 *
 * Arquivo puro (sem `server-only`): usado nas actions e na página.
 */

export const ORCAMENTO_TRANSFERENCIA_DESC_RE = /^or[çc]amento de transfer/i;
export const ATPV_DESC_RE = /atpv/i;
export const BOLETO_DESC_RE = /^boleto/i;

/** Ações do estoque que liberam o anexo (basta uma delas). */
export function acoesDoAnexo(kind: string, description: string): string[] {
  if (kind === "CRLV") return ["crlv"];
  // Fotos são o anúncio: quem posta na vitrine também cuida delas.
  if (kind === "FOTO_VEICULO") return ["editar", "publicar"];
  if (kind === "DOCUMENTO") {
    if (ORCAMENTO_TRANSFERENCIA_DESC_RE.test(description)) return ["orcamento"];
    if (ATPV_DESC_RE.test(description)) return ["atpv"];
    if (BOLETO_DESC_RE.test(description)) return ["boletos"];
    return ["comunicacao"];
  }
  return ["editar"];
}
