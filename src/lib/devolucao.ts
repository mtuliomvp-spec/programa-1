/**
 * A quem vai a devolução do excedente do financiamento de terceiros.
 *
 * Módulo puro (sem Prisma): usado no formulário, nas fichas, no contrato e na
 * geração do título a pagar — todos precisam falar a mesma língua.
 *  - vazio / "COMPRADOR": o comprador, como sempre foi;
 *  - "PROPRIETARIO": o vendedor, que ainda não recebeu pela venda;
 *  - "TERCEIRO": a conta de outra pessoa, indicada e autorizada pelas duas
 *    partes (o nome e o CPF/CNPJ do titular ficam na operação e no contrato).
 */
export type DevolucaoPara = "COMPRADOR" | "PROPRIETARIO" | "TERCEIRO";

/** Como é guardado: null = comprador (o padrão de sempre). */
export function devolucaoParaSalvar(v: string | null | undefined): "PROPRIETARIO" | "TERCEIRO" | null {
  return v === "PROPRIETARIO" || v === "TERCEIRO" ? v : null;
}

/** Nome de quem recebe, para os textos de tela ("Dados bancários do …"). */
export function quemRecebeLabel(v: string | null | undefined): string {
  if (v === "PROPRIETARIO") return "proprietário/vendedor";
  if (v === "TERCEIRO") return "terceiro autorizado";
  return "comprador";
}
