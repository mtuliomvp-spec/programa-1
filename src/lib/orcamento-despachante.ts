/**
 * O que o orçamento/recibo do despachante cobra.
 *
 * O despachante usa o mesmo talão para tudo: a linha TRANSFERÊNCIA é só uma
 * entre 2ª via do CRLV-e, licenciamento, placa, vistoria… Quando ela está em
 * branco e o que foi cobrado é serviço avulso conhecido, o recibo NÃO é de
 * transferência — não abre processo, não tem destino, não mexe no título de
 * transferência reservado na venda.
 *
 * Linha genérica ("SERVIÇO", "OUTROS", "URGÊNCIA") sozinha não diz nada: fica
 * como transferência, que é para o que o card existe.
 */

export type LinhaOrcamento = { descricao: string; valor: number };

const SERVICO_AVULSO =
  /2[ªa°º]?\s*via|segunda\s+via|\bcrv|\bcrlv|atpv|licenciamento|seguro|ipva|placa|emplacamento|vistoria|gravame|licen[cç]a|consulta|tarjeta|mudan[cç]a|cart[oó]rio/i;

export function classificarOrcamento(itens: LinhaOrcamento[], observacao = ""): "cancelamento" | "servicos" | "transferencia" {
  if (/cancel/i.test([observacao, ...itens.map((i) => i.descricao)].join(" "))) return "cancelamento";
  const cobradas = itens.filter((i) => i.valor > 0);
  if (!cobradas.length || cobradas.some((i) => /transfer/i.test(i.descricao))) return "transferencia";
  return cobradas.some((i) => SERVICO_AVULSO.test(i.descricao)) ? "servicos" : "transferencia";
}
