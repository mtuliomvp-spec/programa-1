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

  // --- Contas e caixas ------------------------------------------------------
  "apagar.selecionar": {
    titulo: "Selecionar contas",
    oQueFaz: "Marca a conta (ou todas, no quadrinho do cabeçalho) para agir sobre ela.",
    depois: [
      "Aparece a barra azul com Pagar título, Já paguei, combo e Excluir (conforme a sua permissão).",
      "Marcar não grava nada: dá para desmarcar à vontade.",
    ],
  },
  "apagar.parcial": {
    titulo: "Pagar parcial",
    oQueFaz: "Paga só uma parte desta conta agora.",
    precisa: ["Caixa aberto.", "Informar o valor pago agora e a conta de onde sai."],
    depois: [
      "A parte paga sai da conta escolhida, com a data de trabalho do caixa.",
      "O saldo continua em aberto em Contas a pagar.",
    ],
  },
  "apagar.reverter": {
    titulo: "Reverter pagamento",
    oQueFaz: "Desfaz a baixa de uma conta já paga.",
    depois: [
      "A conta volta a ficar em aberto, sem data de pagamento e sem conta de saída.",
      "O valor deixa de contar como saída no saldo da conta.",
    ],
  },
  "apagar.corrigirdata": {
    titulo: "Corrigir data do pagamento",
    oQueFaz: "Abre um campo para trocar só o dia em que este pagamento entrou no sistema.",
    depois: ["O valor, a conta e o vencimento continuam como estão.", "Só grava depois do Confirmar."],
  },
  "apagar.importcomprovantes": {
    titulo: "Importar comprovantes",
    oQueFaz: "Lê o PDF de comprovantes do banco e anexa cada um à conta paga correspondente.",
    precisa: ["O PDF de comprovantes (lote do banco)."],
    depois: [
      "O sistema procura a conta paga com o mesmo valor e data próxima e anexa o comprovante.",
      "O que não encontrar volta numa lista para você anexar à mão.",
      "Não paga nem muda valores.",
    ],
  },
  "apagar.importnfs": {
    titulo: "Importar NFs e orçamentos",
    oQueFaz: "A IA lê NF-e (DANFE), orçamento, ordem de serviço, guia (IPVA, licenciamento, multa) ou relatório de duplicatas.",
    precisa: ["O arquivo do fornecedor (PDF ou foto)."],
    depois: [
      "Mostra, parcela a parcela, o que vai lançar: conta nova ou anexo a uma já lançada.",
      "Nada entra no financeiro antes de você conferir e clicar em \"Confirmar e lançar\".",
    ],
  },
  "caixa.data": {
    titulo: "Data de trabalho",
    oQueFaz: "O dia do movimento que vai ser aberto. Normalmente é hoje.",
    depois: ["Todo pagamento, recebimento e transferência feito com o caixa aberto leva esta data."],
  },
  "caixa.abrir": {
    titulo: "Abrir caixa",
    oQueFaz:
      "Abre o movimento do dia escolhido. Com o caixa fechado, o sistema não aceita pagamento, recebimento nem transferência.",
    precisa: [
      "Escolher a data de trabalho.",
      "O mês dessa data não pode estar encerrado no Fechamento Mensal.",
    ],
    depois: [
      "Os lançamentos ficam liberados, todos com a data de trabalho.",
      "Se o caixa desse mesmo dia já tinha sido fechado, ele é reaberto.",
      "Pagamentos informados para esse dia (\"Já paguei\") aparecem aqui para confirmar.",
    ],
  },
  "caixa.fechar": {
    titulo: "Fechar caixa",
    oQueFaz: "Encerra o movimento do dia.",
    depois: [
      "Pagamentos, recebimentos e transferências ficam bloqueados até abrir de novo.",
      "O fechamento entra no histórico, com quem fechou.",
      "Se precisar, o mesmo dia pode ser reaberto depois.",
    ],
  },
  "caixa.estornar": {
    titulo: "Estornar caixa do dia",
    oQueFaz: "Desfaz de uma vez todos os pagamentos e recebimentos lançados no caixa aberto.",
    precisa: ["Confirmar na janela que o sistema abre."],
    depois: [
      "Os títulos voltam a pendente e os lançamentos avulsos do dia são apagados.",
      "Baixas que vieram de venda ou de recorrência não são tocadas — o sistema avisa quais, para reverter na origem.",
    ],
  },
  "caixa.historico": {
    titulo: "Histórico",
    oQueFaz: "Mostra quando cada caixa foi aberto e fechado, e por quem. Só consulta.",
  },
  "caixa.fechamento": {
    titulo: "Fechamento Mensal",
    oQueFaz: "Abre a tela que encerra o mês depois de conferido.",
    depois: ["Com o mês encerrado, nada mais pode ser lançado nele (nem abrir caixa em dias dele)."],
  },
  "caixa.boletim": {
    titulo: "Boletim de Caixa",
    oQueFaz: "Abre o relatório das entradas e saídas do dia do caixa, para conferir ou imprimir. Só consulta.",
  },
  "caixa.creditarsinal": {
    titulo: "Creditar sinal",
    oQueFaz: "Confirma que o sinal depositado pelo cliente entrou na conta.",
    precisa: ["Conferir no extrato do banco que o depósito caiu.", "Caixa aberto."],
    depois: [
      "O valor entra na conta indicada, com a data de trabalho do caixa.",
      "O sinal passa a contar como recebido na venda do veículo.",
    ],
    conferir: [{ rotulo: "Livro caixa", href: "/financeiro/livro-caixa" }],
  },
  "fila.confirmar": {
    titulo: "Confirmar no caixa",
    oQueFaz:
      "Lança de verdade os pagamentos e recebimentos marcados na fila — os que foram informados antes (\"Já paguei\", comprovante) e esperavam este dia.",
    precisa: ["Marcar os lançamentos que conferem com o extrato.", "Escolher a conta quando o comprovante não a identificou."],
    depois: [
      "O dinheiro sai (ou entra) na conta, com a data do caixa.",
      "Os títulos passam a pago ou recebido, com o comprovante que já estava anexado.",
    ],
    conferir: CONFERIR_PAGAMENTO,
  },
  "fila.tirar": {
    titulo: "Tirar da fila",
    oQueFaz: "Tira o lançamento da fila sem pagar nem receber.",
    precisa: ["Confirmar na janela."],
    depois: [
      "O título volta a esperar o pagamento normal; o anexo continua nele.",
      "Se era um lançamento avulso feito no movimento de caixa, ele é apagado.",
    ],
  },
  "conta.transferir": {
    titulo: "Registrar transferência",
    oQueFaz: "Registra dinheiro passando de uma conta para outra — por exemplo, o depósito do caixa no banco.",
    precisa: [
      "Caixa aberto.",
      "Origem e destino diferentes. Contas de aplicação usam Aplicar/Resgatar na tela da conta.",
    ],
    depois: [
      "O valor sai da origem e entra no destino, com a data do caixa.",
      "Aparece em \"Transferências entre contas\" e no Livro caixa.",
    ],
    conferir: [{ rotulo: "Livro caixa", href: "/financeiro/livro-caixa" }],
  },
  "conta.nova": {
    titulo: "Cadastrar conta",
    oQueFaz: "Cadastra um banco, caixa ou aplicação para pagar e receber.",
    precisa: ["Nome da conta e tipo. Dados bancários e chave Pix são opcionais."],
    depois: [
      "A conta aparece na lista e vira opção em pagamentos, recebimentos e transferências.",
      "O saldo inicial informado é o ponto de partida do saldo dela.",
    ],
  },

  // --- Estoque: cadastrar veículo -------------------------------------------
  "estoque.lerdocs": {
    titulo: "Ler documentos e preencher",
    oQueFaz:
      "A inteligência artificial lê os documentos da compra (contrato, CRLV, ATPV-e, nota fiscal, boleto ou Pix) e preenche o formulário.",
    precisa: ["Escolher os arquivos (PDF ou foto) no campo ao lado — pode ser vários de uma vez."],
    depois: [
      "Marca, modelo, ano, placa, chassi, Renavam, cor, km, valor da compra, fornecedor e vencimento são preenchidos.",
      "O sistema mostra o que reconheceu em cada arquivo e para onde ele vai na ficha.",
      "Nada é gravado ainda: confira os campos e clique em \"Cadastrar veículo\".",
      "Cada documento lido conta como uma leitura automática do plano.",
    ],
  },
  "estoque.placa": {
    titulo: "Buscar dados pela placa",
    oQueFaz: "Consulta a placa num provedor de dados veiculares: marca, modelo, ano, cor, chassi e valor FIPE.",
    precisa: [
      "Placa digitada.",
      "Consulta por placa contratada pela loja e cadastrada em Parâmetros (sem ela, o sistema busca só a FIPE na tabela pública).",
    ],
    depois: [
      "Os campos são preenchidos e o valor FIPE vai para o preço de venda (continua editável). Nada é gravado ainda.",
      "O chassi vem mascarado: complete com o documento do carro, senão a venda dele fica travada.",
    ],
  },
  "estoque.fipe": {
    titulo: "Buscar FIPE na tabela pública",
    oQueFaz: "Procura o valor FIPE pela marca, modelo, versão e ano já preenchidos, sem usar a consulta por placa.",
    precisa: ["Marca, modelo e ano preenchidos (a versão ajuda a acertar)."],
    depois: ["Aparecem as versões mais prováveis; a escolhida leva o valor para o preço de venda. Nada é gravado ainda."],
  },
  "estoque.cadastrar": {
    titulo: "Cadastrar veículo",
    oQueFaz: "Grava o veículo no estoque com os dados do formulário.",
    precisa: [
      "Placa, dados do carro, fornecedor e forma de aquisição preenchidos.",
      "Conferir o que a leitura dos documentos preencheu.",
    ],
    depois: [
      "O veículo entra no estoque e a ficha dele abre.",
      "As contas a pagar da compra são geradas sozinhas (entrada e parcelas, conforme a forma) — pagas depois em Contas a pagar. Em consignação, nada é gerado agora.",
      "Os documentos importados são anexados, cada um no seu lugar da ficha.",
    ],
    conferir: [
      { rotulo: "Estoque", href: "/estoque" },
      { rotulo: "Contas a pagar", href: "/financeiro/a-pagar" },
    ],
  },

  // --- Vendas ---------------------------------------------------------------
  "vendas.trocaplaca": {
    titulo: "Buscar dados da troca",
    oQueFaz: "Consulta a placa do carro que o cliente deixa na troca e preenche marca, modelo, ano e FIPE.",
    precisa: ["Placa do carro da troca digitada.", "Consulta por placa contratada pela loja (sem ela, só a FIPE da tabela pública)."],
    depois: ["Os dados da troca são preenchidos. Nada é gravado ainda."],
  },
  "vendas.gerarpre": {
    titulo: "Gerar pré-venda",
    oQueFaz: "Cria a ficha do negócio com tudo o que foi combinado, para revisar e imprimir o contrato.",
    precisa: [
      "Veículo e cliente escolhidos (dá para cadastrar o cliente aqui mesmo).",
      "Preço, forma de pagamento e, se houver, troca, financiamento e comissões.",
    ],
    depois: [
      "Abre a ficha da pré-venda, com o contrato pronto para imprimir.",
      "Nada é lançado no financeiro até \"Registrar venda\".",
      "Enquanto ela estiver aberta, o mesmo carro não pode ter pré-venda para outro cliente.",
    ],
  },
  "vendas.contrato": {
    titulo: "Contrato de venda",
    oQueFaz: "Abre o contrato com os dados da pré-venda, para imprimir ou salvar em PDF. Só consulta.",
  },
  "vendas.excluirpre": {
    titulo: "Excluir pré-venda",
    oQueFaz: "Remove a pré-venda. Ela não gerou nada no financeiro.",
    precisa: ["Confirmar no bloco que aparece abaixo do botão."],
    depois: ["A pré-venda some da lista e o carro fica livre para outro negócio."],
  },
  "vendas.registrar": {
    titulo: "Registrar venda",
    oQueFaz: "Transforma a pré-venda em venda de verdade e gera os lançamentos financeiros.",
    precisa: [
      "Caixa aberto: a venda leva a data do caixa.",
      "Ficha e contrato revisados.",
      "Confirmar no bloco que aparece abaixo do botão.",
    ],
    depois: [
      "O veículo passa a vendido e sai do estoque.",
      "As contas a receber são geradas conforme a forma de pagamento (inclusive o repasse da financeira, quando houver).",
      "Comissões do vendedor, indicações e a transferência cobrada viram contas a pagar.",
      "O carro da troca, se houver, entra no estoque.",
    ],
    conferir: [
      { rotulo: "Vendas", href: "/vendas" },
      { rotulo: "Contas a receber", href: "/financeiro/a-receber" },
      { rotulo: "Contas a pagar", href: "/financeiro/a-pagar" },
    ],
  },

  // --- Contas a receber -----------------------------------------------------
  "areceber.conta": {
    titulo: "Conta que vai receber",
    oQueFaz: "Escolhe a conta (banco ou caixa) onde o dinheiro entra.",
    depois: ["Nada é gravado só por trocar a conta aqui."],
  },
  "areceber.data": {
    titulo: "Data do recebimento",
    oQueFaz: "É a data do caixa aberto (o movimento do dia). Não se escolhe aqui.",
    depois: ["\"Receber título\" grava o recebimento nesta data."],
  },
  "areceber.receber": {
    titulo: "Receber título",
    oQueFaz: "Baixa os títulos selecionados como recebidos, com o dinheiro entrando na conta escolhida na data do caixa.",
    precisa: [
      "Marcar um ou mais títulos na lista.",
      "Escolher a conta que vai receber.",
      "Caixa do dia aberto e mês não fechado (senão o sistema avisa e não recebe).",
    ],
    depois: [
      "Cada título passa a \"Recebido\".",
      "O valor entra no saldo da conta escolhida, na data do caixa.",
      "O recebimento aparece no Livro caixa, no Fluxo de caixa e no extrato da conta.",
    ],
    conferir: CONFERIR_PAGAMENTO,
  },
  "areceber.excluir": {
    titulo: "Excluir selecionados",
    oQueFaz: "Apaga os títulos a receber selecionados que ainda não foram recebidos.",
    precisa: ["Confirmar no bloco que aparece ao lado do botão."],
    depois: [
      "Título já recebido ou que veio de venda fica de fora (ajuste na venda).",
      "De recorrência, só esta parcela sai; as próximas continuam.",
    ],
  },
  "areceber.limpar": {
    titulo: "Limpar",
    oQueFaz: "Desmarca todos os títulos selecionados. Nada é alterado.",
  },

  // --- Renave (ficha do veículo) -------------------------------------------
  "areceber.selecionar": {
    titulo: "Selecionar contas",
    oQueFaz: "Marca a conta (ou todas, no quadrinho do cabeçalho) para agir sobre ela.",
    depois: [
      "Aparece a barra com Receber título e Excluir (conforme a sua permissão).",
      "Marcar não grava nada: dá para desmarcar à vontade.",
    ],
  },
  "areceber.receberlinha": {
    titulo: "Receber esta conta",
    oQueFaz: "Abre os campos para registrar o recebimento só desta conta.",
    precisa: ["Caixa aberto.", "Informar o valor recebido e a conta onde entrou.", "Observação é opcional."],
    depois: [
      "Só grava depois do Confirmar.",
      "Recebendo menos que o total, o restante continua a receber (ou vira desconto, em venda de veículo).",
    ],
  },
  "areceber.jacaiu": {
    titulo: "Já caiu",
    oQueFaz: "Para quando o dinheiro já entrou no banco, mas o caixa ainda não chegou nesse dia.",
    precisa: ["Data em que entrou, valor e conta creditada.", "Comprovante é opcional (a IA lê a data)."],
    depois: [
      "A entrada fica pré-lançada (⏳), sem mexer no saldo ainda.",
      "O crédito de verdade é confirmado em Contas e caixas, quando o caixa chegar nesse dia.",
    ],
    conferir: [{ rotulo: "Contas e caixas", href: "/financeiro/contas" }],
  },
  "areceber.nocapital": {
    titulo: "Receber no capital",
    oQueFaz: "Quita a conta abatendo do capital de um sócio, sem dinheiro entrar no caixa.",
    precisa: ["Escolher o sócio e confirmar."],
    depois: ["A conta fica recebida e o valor vira retirada de capital do sócio (o saldo dele diminui)."],
  },
  "areceber.reverter": {
    titulo: "Reverter recebimento",
    oQueFaz: "Desfaz o recebimento de uma conta já recebida.",
    depois: ["A conta volta a ficar a receber.", "O valor deixa de contar como entrada no saldo da conta."],
  },
  "areceber.corrigirdata": {
    titulo: "Corrigir data do recebimento",
    oQueFaz: "Abre um campo para trocar só o dia em que este recebimento entrou no sistema.",
    depois: ["O valor, a conta e o vencimento continuam como estão.", "Só grava depois do Confirmar."],
  },
  "renave.atualizar": {
    titulo: "Atualizar do Renave",
    oQueFaz: "Busca no Renave a situação atual deste veículo: estoque, termos e anotações.",
    depois: ["A ficha passa a mostrar o que o Renave tem agora. Nada é enviado."],
  },
  "renave.aptidao": {
    titulo: "Consultar aptidão",
    oQueFaz: "Consulta, sem custo, se o veículo pode entrar no estoque da loja no Renave.",
    precisa: ["Tipo e número do CRV preenchidos."],
    depois: ["Mostra o resultado da consulta. Nada é registrado."],
  },
  "renave.codigo": {
    titulo: "Buscar código do CRV",
    oQueFaz: "Busca no Renave o código de segurança do CRV a partir do número digitado.",
    depois: ["O código encontrado é preenchido no formulário. Nada é registrado."],
  },
  "renave.entrada": {
    titulo: "Registrar entrada no Renave",
    oQueFaz: "Registra a entrada (compra) do veículo no estoque da loja no Renave.",
    precisa: [
      "Dados do vendedor, do CRV e da compra preenchidos — o sistema aponta o que faltar.",
      "Certificado e-CNPJ da loja configurado e DETRAN do estado operando o Renave.",
      "Em produção a operação é cobrada pelo SERPRO e tem valor legal: o sistema pede confirmação.",
    ],
    depois: [
      "O Renave devolve o termo de entrada e o veículo passa a constar no estoque da loja.",
      "Próximos passos: assinatura do vendedor (quando pedida), NF-e de entrada e a confirmação do Detran.",
    ],
  },
  "renave.assinatura": {
    titulo: "Enviar assinatura",
    oQueFaz: "Envia ao Renave a ATPV-e assinada pelo vendedor.",
    precisa: ["ATPV-e assinada anexada na ficha (card ATPV-e ou Documentos)."],
    depois: ["O envio fica registrado. Depois que o Detran inicia a transferência, não dá para reenviar."],
  },
  "renave.nota": {
    titulo: "Enviar NF-e ao Renave",
    oQueFaz: "Informa ao Renave a chave da nota fiscal (de entrada ou de venda) deste veículo.",
    precisa: ["Chave de acesso de 44 dígitos — já vem da ficha quando a nota foi emitida pelo sistema."],
    depois: ["O Renave vincula a nota à movimentação do veículo."],
  },
  "renave.saida": {
    titulo: "Registrar saída no Renave",
    oQueFaz: "Registra a saída (venda) do veículo no Renave, em nome do comprador.",
    precisa: [
      "Venda registrada no sistema.",
      "Dados do comprador e município conferidos.",
      "Em produção a operação é cobrada pelo SERPRO e tem valor legal: o sistema pede confirmação.",
    ],
    depois: [
      "O Renave gera a ATPV-e da venda, que dispensa as assinaturas da loja e do comprador.",
      "Próximo passo: enviar a NF-e de venda.",
    ],
  },
  "renave.cancelar": {
    titulo: "Cancelar no Renave",
    oQueFaz: "Cancela a última operação do veículo no Renave (a entrada ou, se já vendido, a saída).",
    precisa: ["Data do cancelamento e CPF do operador.", "Confirmar na janela."],
    depois: ["O Renave registra o cancelamento e a ficha é atualizada."],
  },
};
