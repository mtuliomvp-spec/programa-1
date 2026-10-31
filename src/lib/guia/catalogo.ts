/**
 * Modo guia (demonstração): o que cada botão faz, explicado ANTES do clique.
 *
 * O botão ganha `data-guia="<id>"` e o texto mora aqui, num lugar só — a tela
 * não muda nada quando o guia está desligado. Depois da operação, a própria
 * tela chama `guiaFeito(id, linhas)` (src/lib/guia/eventos.ts) com o que de
 * fato aconteceu (quantos títulos, quanto, de qual conta).
 *
 * Regra de redação: só o que o código faz hoje. Se o comportamento mudar, o
 * texto daqui muda junto.
 *
 * Arquivo puro: lido pelo componente do guia no navegador.
 */
export type GuiaItem = {
  titulo: string;
  /** Uma frase: para que serve. */
  oQueFaz: string;
  /** O que precisa estar pronto antes de clicar. */
  precisa?: string[];
  /** O que acontece depois do clique. */
  depois?: string[];
  /** Onde conferir o resultado. */
  conferir?: { rotulo: string; href: string }[];
};

const CONFERIR_PAGAMENTO = [
  { rotulo: "Contas e caixas", href: "/financeiro/contas" },
  { rotulo: "Livro caixa", href: "/financeiro/livro-caixa" },
  { rotulo: "Fluxo de caixa", href: "/financeiro/fluxo-caixa" },
];

export const GUIA: Record<string, GuiaItem> = {
  "apagar.conta": {
    titulo: "Conta que vai pagar",
    oQueFaz: "Escolhe a conta (banco ou caixa) de onde o dinheiro vai sair.",
    depois: [
      "Vale para \"Pagar título\" e para \"Já paguei\".",
      "Nada é gravado só por trocar a conta aqui.",
    ],
  },
  "apagar.data": {
    titulo: "Data do pagamento",
    oQueFaz: "É a data do caixa aberto (o movimento do dia). Não se escolhe aqui.",
    depois: [
      "\"Pagar título\" grava o pagamento nesta data.",
      "Para um pagamento feito em outro dia, use \"Já paguei\".",
    ],
  },
  "apagar.pagar": {
    titulo: "Pagar título",
    oQueFaz: "Baixa os títulos selecionados como pagos, com o dinheiro saindo da conta escolhida na data do caixa.",
    precisa: [
      "Marcar um ou mais títulos na lista.",
      "Escolher a conta que vai pagar.",
      "Caixa do dia aberto e mês não fechado (senão o sistema avisa e não paga).",
    ],
    depois: [
      "Cada título passa a \"Pago\".",
      "O valor sai do saldo da conta escolhida, na data do caixa.",
      "O pagamento aparece no Livro caixa, no Fluxo de caixa e no extrato da conta.",
    ],
    conferir: CONFERIR_PAGAMENTO,
  },
  "apagar.japaguei": {
    titulo: "Já paguei",
    oQueFaz:
      "Para quando o dinheiro já saiu do banco — por exemplo, um boleto que cobre vários títulos. Abre um painel para informar o dia do pagamento e anexar o comprovante, um só para todos.",
    precisa: [
      "Marcar os títulos que foram pagos.",
      "Escolher, na barra, a conta que pagou.",
      "Ter o comprovante (foto ou PDF) — opcional, mas recomendado.",
    ],
    depois: [
      "Ao anexar o comprovante, a IA lê o papel, sugere a data e avisa se ele parece ser de outra conta.",
      "Em \"Confirmar o pagamento\", os títulos entram na fila do caixa com o comprovante anexado.",
      "O saldo da conta só baixa quando o caixa chegar ao dia do pagamento e você confirmar em Contas e caixas.",
    ],
  },
  "apagar.japaguei.confirmar": {
    titulo: "Confirmar o pagamento",
    oQueFaz: "Pré-lança o pagamento dos títulos selecionados no dia informado, com o comprovante anexado.",
    precisa: ["Conferir a data do pagamento e a conta.", "Se o PDF do comprovante tiver senha, digitá-la."],
    depois: [
      "Os títulos entram na fila do caixa para o dia informado.",
      "Quando o movimento chegar nesse dia, confirme em Contas e caixas — aí o saldo baixa e o título vira \"Pago\".",
    ],
    conferir: [{ rotulo: "Contas e caixas", href: "/financeiro/contas" }],
  },
  "apagar.substituicao": {
    titulo: "Pagar com substituição",
    oQueFaz:
      "Aparece quando todos os selecionados são retiradas de capital do mesmo sócio e o capital dele está aplicado: outro sócio assume essa fatia aplicada.",
    precisa: ["Escolher a aplicação de onde sai a fatia.", "Escolher o sócio que assume a fatia."],
    depois: [
      "O valor sai da conta que vai pagar e vira retirada do sócio.",
      "O capital livre do outro sócio passa a aplicado.",
    ],
    conferir: [{ rotulo: "Capital", href: "/capital" }],
  },
  "apagar.combo": {
    titulo: "Adicionar ao combo",
    oQueFaz:
      "Junta os títulos selecionados no combo de pagamento escolhido ao lado, para quitar todos de uma vez com um borderô.",
    precisa: ["Ter um combo aberto (crie em Financeiro › Combos).", "Marcar títulos ainda não pagos."],
    depois: [
      "Os títulos passam a fazer parte do combo e saem da seleção.",
      "Nada é pago agora: o pagamento acontece quando o combo for quitado.",
    ],
    conferir: [{ rotulo: "Combos de pagamento", href: "/financeiro/combos" }],
  },
  "apagar.excluir": {
    titulo: "Excluir selecionados",
    oQueFaz: "Apaga os títulos selecionados que ainda não foram pagos (manuais e de recorrência).",
    precisa: ["Confirmar na janela que o sistema abre."],
    depois: [
      "Os títulos somem da lista. Uma ocorrência de recorrência excluída não é gerada de novo.",
      "Os que não podem ser excluídos aparecem no topo da lista, com o motivo e o caminho até a origem.",
    ],
  },
  "apagar.limpar": {
    titulo: "Limpar",
    oQueFaz: "Desmarca todos os títulos selecionados. Nada é alterado.",
  },
};
