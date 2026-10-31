/**
 * Nome da loja mostrado nas telas, documentos e e-mails: o nome fantasia dos
 * Parâmetros (ou a razão social, se o fantasia estiver vazio). Cada
 * instalação é de um cliente, então nada aqui pode trazer o nome de uma loja
 * fixo no código.
 */
export const NOME_LOJA_PADRAO = "Sua Revenda";

type ComNome = { nomeFantasia?: string | null; razaoSocial?: string | null } | null | undefined;

export function nomeDaLoja(company: ComNome): string {
  return company?.nomeFantasia?.trim() || company?.razaoSocial?.trim() || NOME_LOJA_PADRAO;
}

/**
 * Atributo do <body> com o nome da loja: componentes de cliente que montam
 * texto na hora (cabeçalho do PDF, marca d'água da foto) leem daqui sem
 * precisar receber o nome por props em cada tela.
 */
export function nomeDaLojaNoNavegador(): string {
  if (typeof document === "undefined") return NOME_LOJA_PADRAO;
  return document.body.dataset.loja?.trim() || NOME_LOJA_PADRAO;
}
