# -*- coding: utf-8 -*-
"""Manual do sistema: o que cada tela do menu faz e como se usa."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.units import mm
from reportlab.platypus import CondPageBreak, NextPageTemplate, PageBreak, Spacer

from estilo_fincore import (
    AMBAR_B, AMBAR_F, AZUL, AZUL_B, AZUL_F, BRANCO, caixa, esp, gerar, grade, li, linha_stats,
    p, secao, tabela,
)

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SAIDA = os.path.join(RAIZ, "public/documentos/fincore360-manual-do-sistema.pdf")

story = []


def tela(nome, rota, oque, passos):
    """Bloco de uma tela do menu: nome, endereço, o que faz e como se usa."""
    out = [
        CondPageBreak(42 * mm),
        p(f"{nome} <font size='8' color='#94A3B8'>&nbsp;·&nbsp; {rota}</font>", "h2"),
        p(f"<b>O que faz.</b> {oque}", "p"),
    ]
    for passo in passos:
        out.append(li(passo))
    out.append(Spacer(1, 3))
    return out


# ============================================================ CAPA
story.append(Spacer(1, 92 * mm))
story.append(p(esp("Manual do sistema"), "kicker_claro"))
story.append(p("O que cada tela faz", "h1_capa"))
story.append(p("e como usar", "h1_capa2"))
story.append(p(
    "Guia de todas as funcionalidades do menu, do Dashboard à última tela de configuração. "
    "Cada item traz o que a tela resolve e o passo a passo de uso — feito para consultar no dia a "
    "dia e para treinar quem está chegando.", "lead_escuro"))
story.append(Spacer(1, 9 * mm))
story.append(linha_stats([
    ("7", "grupos de menu"),
    ("40", "telas no menu"),
    ("12", "módulos"),
    ("47", "permissões"),
]))
story.append(NextPageTemplate("padrao"))
story.append(PageBreak())

# ============================================================ CONCEITOS
story += secao(
    "Antes de começar",
    "Seis ideias que valem para o sistema inteiro",
    "Entendendo estes seis pontos, qualquer tela do menu fica previsível — eles se repetem em "
    "todas elas.",
)
story.append(grade([
    ("1. O menu mostra só o que você pode",
     "O acesso é por módulo e por ação. Se uma tela citada aqui não aparece no seu menu, é permissão: "
     "peça ao administrador em Usuários. Administradores veem tudo da loja; algumas telas técnicas são "
     "exclusivas do fornecedor do sistema."),
    ("2. Caixa aberto e data de trabalho",
     "Pagamentos e recebimentos usam a data do caixa aberto, não a data de hoje. Se o caixa estiver "
     "fechado, os botões de baixa ficam bloqueados: abra o caixa em Contas e caixas com a data certa "
     "e lance na sequência."),
    ("3. O farol de integridade",
     "No Livro caixa e no Lucro/Prejuízo há dois testes permanentes: saldos convergentes e equação "
     "patrimonial × resultado. Enquanto um deles estiver vermelho, o sistema bloqueia novos "
     "lançamentos — é proposital. Use os botões de correção indicados no próprio aviso."),
    ("4. Fluxo estrutural e categoria",
     "Todo lançamento cai em um dos três fluxos — Capital, Veículos ou Administrativo — e em uma "
     "categoria. É essa separação que faz o relatório distinguir lucro de carro de custo de estrutura. "
     "Na dúvida, mantenha o fluxo sugerido pela tela."),
    ("5. Anexo é prova, e a IA lê por você",
     "Quase toda tela aceita anexo (nota, boleto, comprovante, contrato). Onde existe o botão de "
     "leitura automática, o sistema preenche os campos e espera a sua conferência: ele avisa "
     "divergências e nunca sobrescreve o que já estava preenchido."),
    ("6. Funciona no celular",
     "As telas se adaptam ao celular. O vendedor consulta estoque, tira foto e registra pré-venda no "
     "atendimento; o escritório usa o computador para o financeiro e os relatórios."),
]))
story.append(PageBreak())

# ============================================================ VISÃO GERAL
story += secao("Visão geral", "Dashboard", "A primeira tela depois do login: o retrato do dia.")
story += tela(
    "Dashboard", "/",
    "Reúne em um lugar o saldo em caixa, o estoque, o que há a pagar e a receber, as vendas do mês, "
    "o fluxo de caixa dos últimos meses e os próximos vencimentos.",
    [
        "Leia de cima para baixo: os cartões de números mostram a situação de agora; o gráfico "
        "compara os últimos meses; a lista final traz o que vence nos próximos dias.",
        "<b>Os números em vermelho são atalhos.</b> Clicar em “Pendente a receber”, “Comprado a "
        "pagar” e nas demais linhas em destaque abre exatamente os títulos que formam aquele valor — "
        "não a lista inteira do módulo.",
        "Os blocos de fluxo estrutural (Capital, Veículos, Administrativo) mostram quanto cada frente "
        "movimentou; use-os para achar rapidamente onde o mês saiu do previsto.",
        "Se você entrou e o painel avisa que não há tela liberada, o seu usuário foi aprovado mas "
        "ainda está sem perfil de acesso — fale com o administrador.",
    ],
)
story.append(PageBreak())

# ============================================================ OPERAÇÃO
story += secao(
    "Operação",
    "Do carro que chega à venda concluída",
    "Sete telas cobrem o ciclo do veículo: entrada, avaliação, documentação, venda e as peças que "
    "entram no meio do caminho.",
)
story += tela(
    "Estoque de veículos", "/estoque",
    "Lista os veículos com situação, tempo de pátio e valores. É a porta de entrada para a ficha de "
    "cada carro, onde fica tudo sobre ele.",
    [
        "<b>Cadastrar:</b> “+ Novo veículo”, digite a placa e use a busca automática — marca, modelo, "
        "versão, ano, cor, combustível e câmbio vêm preenchidos. Confira e complete o valor de compra "
        "e o fornecedor.",
        "<b>A compra vira conta a pagar</b> sozinha; o veículo já nasce ligado ao título.",
        "<b>Na ficha do veículo</b> você encontra, em cartões separados: fotos e vitrine, custos e "
        "manutenções, documentos (CRLV, ATPV-e, outros), débitos do veículo, adiantamentos, Renave, "
        "comunicação de venda e a ordem de compra.",
        "<b>Fotos:</b> envie várias de uma vez (são otimizadas automaticamente). Cada foto tem “Cobrir "
        "placa”: <b>toque nos quatro cantos da placa</b> e a tarja fica com a forma exata dela, mesmo "
        "inclinada. Aproxime com o <b>+</b> (até 6×) quando a foto for tirada de longe e arraste para "
        "enquadrar. A primeira miniatura é a capa do anúncio.",
        "<b>Publicar na vitrine:</b> no cartão de fotos, “Postar na vitrine”. Exige ao menos uma foto "
        "e o carro em estoque. Depois de publicado aparece o link “Ver anúncio”.",
        "<b>Visitas no anúncio:</b> logo abaixo, o cartão mostra quantas vezes o anúncio foi "
        "aberto, quantas nos últimos 7 dias e quantas pessoas diferentes o viram. A listagem do "
        "estoque tem a coluna <b>Visitas</b>, para comparar os carros. Quem está logado no sistema "
        "não é contado, e recarregar a página não conta de novo.",
        "<b>Leitura automática:</b> anexe o contrato de compra, o CRLV ou a ATPV-e e use o botão de "
        "ler documento — os campos vazios são preenchidos e as divergências viram aviso.",
        "<b>Custos:</b> lance preparação, peças e serviços no cartão de custos; cada lançamento vira "
        "conta a pagar e entra no custo que aparece no lucro da venda.",
        "<b>Foto do cliente (antifraude):</b> no cartão de mesmo nome, “Fotografar cliente” usa a "
        "câmera traseira e “Selfie com o cliente”, a frontal. A foto sai carimbada com a loja, data e "
        "hora, endereço e coordenadas do GPS; você confere a prévia e toca em <b>Anexar foto</b>. Ela "
        "fica no prontuário do veículo. Se o aparelho negar a localização, a foto é anexada assim "
        "mesmo, marcada como sem localização.",
    ],
)
story += tela(
    "Renave (entradas e saídas)", "/estoque/renave",
    "O livro eletrônico de escrituração do estoque exigido pela norma: mostra os veículos do período, "
    "o que está com dado faltando e os prazos de ATPV-e das consignações.",
    [
        "Escolha o período e use o filtro “Só os que têm dados faltando” para ver o que impede a "
        "escrituração.",
        "Cada pendência aponta o campo que falta (número do CRV, código de segurança, data de entrada, "
        "protocolo) — corrija na ficha do veículo e volte.",
        "Fique de olho no aviso de consignação: a ATPV-e tem prazo contado a partir da entrada.",
        "Configure antes em Parâmetros › Renave (dados da integradora e do estabelecimento).",
    ],
)
story += tela(
    "Veículos avaliados", "/avaliacoes",
    "Avaliação do carro de terceiro: checklist item a item, fotos, FIPE, valor da loja × valor pedido "
    "pelo proprietário — e a conferência na entrega.",
    [
        "“Nova avaliação”: digite a placa para puxar os dados, marque o checklist (OK, atenção ou "
        "problema, com observação) e informe os valores.",
        "Anexe as fotos e use “Cobrir placa” nas que forem circular — quatro toques nos cantos da "
        "placa e ela some da imagem.",
        "Gere o <b>PDF da avaliação</b> para enviar ao cliente.",
        "<b>Publicar como repasse:</b> no cartão “Vitrine (repasse)”, informe o preço (opcional) e "
        "poste. O anúncio sai no site com a tarja REPASSE sobre as fotos; valor avaliado, pedido do "
        "proprietário e placa nunca aparecem. Sem preço, o anúncio mostra “Consulte”. O mesmo "
        "cartão mostra as <b>visitas</b> que o anúncio recebeu.",
        "<b>Na entrega</b>, refaça o mesmo checklist em “Conferência de entrega”: o sistema compara "
        "com a avaliação e destaca as divergências.",
    ],
)
story += tela(
    "Vendas", "/vendas",
    "Registra a venda do veículo do estoque e gera, de uma vez, todo o financeiro do negócio.",
    [
        "Comece por <b>“+ Nova venda”</b>: cliente, veículo, forma de pagamento (à vista, parcelado "
        "com entrada ou financiado), troca na entrada, comissão e indicações.",
        "A venda nasce como <b>pré-venda</b> — nada mexe no financeiro ainda. Revise o resumo com "
        "entrada, parcelas, comissões e lucro previsto.",
        "<b>Efetivar</b> gera as contas a receber, as comissões a pagar, o repasse da financeira "
        "quando houver, e baixa o carro do estoque.",
        "Na ficha da venda ficam o contrato, o recibo e o link de conferência para o cliente.",
        "<b>Na entrega do carro</b>, registre a <b>foto do cliente (antifraude)</b> na ficha do "
        "veículo: é a prova de quem levou o carro, com data, hora e local. A lista do estoque acusa "
        "o vendido que ainda está sem ela.",
        "Precisou corrigir? Estorne pela própria ficha — o sistema desfaz os títulos gerados.",
    ],
)
story += tela(
    "Financiamento de terceiros", "/vendas/financiamento-terceiros",
    "Para quando a loja apenas intermedeia o financiamento de um veículo que não é dela: o carro não "
    "sai do estoque, mas a comissão entra no caixa.",
    [
        "“+ Nova operação”: dados do veículo e do comprador, banco financiador e valor.",
        "Também tem etapa de pré-venda e conferência antes de concluir.",
        "Gera o <b>contrato de intermediação</b> e a comissão a receber.",
    ],
)
story += tela(
    "Peças", "/pecas",
    "Almoxarifado: entrada de peças, venda de balcão e consumo pelos veículos, com alerta de estoque "
    "mínimo.",
    [
        "“+ Nova peça”: código, nome, custo, preço de venda e estoque mínimo.",
        "<b>Repor</b> gera conta a pagar ao fornecedor; <b>vender</b> gera conta a receber.",
        "Aplicar peça em um veículo do estoque lança o custo na ficha do carro.",
        "A lista destaca o que está abaixo do mínimo.",
    ],
)
story += tela(
    "Solicitações de compra", "/compras",
    "Fluxo de pedido de compra: alguém solicita, o administrador aprova e a conclusão vira conta a "
    "pagar.",
    [
        "“Nova solicitação”: o que precisa, para qual veículo ou setor, com foto ou orçamento anexado "
        "pelo celular.",
        "O administrador aprova ou recusa; ao concluir, o título entra em Contas a pagar.",
        "<b>“Importar NF”</b> lê a nota do fornecedor (PDF) e <b>mostra o que vai lançar</b> antes "
        "de gravar; ao confirmar, cria os títulos que faltam, já com a nota anexada e as peças "
        "identificadas.",
    ],
)
story.append(PageBreak())

# ============================================================ FINANCEIRO
story += secao(
    "Financeiro",
    "Onde o dinheiro entra, sai e é conferido",
    "Onze telas, na ordem em que costumam ser usadas: primeiro as contas, depois os títulos, por fim "
    "a apuração.",
)
story += tela(
    "Contas e caixas", "/financeiro/contas",
    "Cadastro de caixas, bancos, financeiras e contas de aplicação. Toda baixa passa por uma delas.",
    [
        "“Nova conta”: nome, tipo e saldo inicial. Marque a conta padrão da loja.",
        "<b>Abrir e fechar o caixa do dia</b> em “Movimento de caixa diário” — é a data de trabalho "
        "que os pagamentos vão usar.",
        "<b>Transferir entre contas</b> registra a saída e a entrada de uma vez.",
        "Clicando em uma conta abre o <b>extrato</b> com todas as movimentações, filtro e busca.",
        "<b>Banco Neutro:</b> conta de compensação do sistema, para dar baixa no que não passou por "
        "caixa nenhum (a parcela já descontada do repasse, o acerto que se anula). Ela deve fechar em "
        "zero — se ficar com saldo, o farol avisa.",
    ],
)
story += tela(
    "Contas a pagar", "/financeiro/a-pagar",
    "Todos os títulos a pagar: compra de veículo, peças, despesas, comissões, impostos e recorrentes.",
    [
        "Filtre por texto, período, valor, status, fornecedor, beneficiário ou veículo.",
        "<b>Pagar em lote:</b> marque os títulos, escolha a conta que vai pagar e confirme — a data é "
        "a do caixa aberto.",
        "<b>Pagamento parcial:</b> informe quanto está pagando agora; o saldo continua em aberto.",
        "Na tela de edição do título: anexe o <b>boleto</b> e use a leitura automática (valor e "
        "vencimento), anexe <b>outros documentos</b> e, se houve devolução ao fornecedor, use "
        "“Devolveu mercadoria?” para abater o valor da NF de devolução.",
        "<b>Importar comprovantes</b> e <b>Importar NFs do fornecedor</b> processam PDFs com vários "
        "documentos de uma vez, anexando cada um ao título certo.",
        "<b>A importação de NF passa por revisão.</b> Depois da leitura, a tela lista cada nota com "
        "o fornecedor identificado, os itens e, parcela a parcela, o que vai acontecer — <i>cria "
        "título novo</i> ou <i>anexa ao título nº tal, já lançado</i>. Nada entra no financeiro até "
        "você desmarcar o que não quiser e tocar em <b>Confirmar e lançar</b>. O fornecedor pode ser "
        "trocado ali mesmo, quando o CNPJ da nota não casar com o cadastro.",
        "<b>O fluxo é escolhido na revisão</b> e é obrigatório: <i>Veículos</i> (aí você indica o "
        "carro, e o valor entra no custo dele), <i>Peças</i> (almoxarifado), <i>Administrativo</i> "
        "(despesa da loja) ou <i>Capital</i> (aí você escolhe o sócio, e o valor vira retirada dele "
        "quando o título for pago). É o que decide onde o gasto aparece no resultado do mês.",
        "Cada título gera <b>ordem de pagamento</b> em PDF com os dados bancários do beneficiário.",
    ],
)
story += tela(
    "Combos de pagamento", "/financeiro/combos",
    "Junta vários títulos do mesmo beneficiário num pacote só, pago de uma vez e com um borderô.",
    [
        "Em Contas a pagar, marque os títulos e use “Adicionar ao combo”.",
        "No combo, confira a lista e o total; pague tudo em uma operação.",
        "O <b>borderô</b> em PDF lista os títulos pagos — serve de comprovante para o beneficiário.",
    ],
)
story += tela(
    "Contas a receber", "/financeiro/a-receber",
    "Os títulos a receber — de vendas, peças e outras receitas — com controle do que está atrasado.",
    [
        "“Receber” abre o painel de baixa: valor, conta que recebeu e, se quiser, uma <b>observação</b> "
        "(ela aparece no extrato da conta e no livro caixa).",
        "Recebimento parcial cria automaticamente a parcela do saldo restante.",
        "O filtro “vendas” isola o que veio de venda de veículo.",
    ],
)
story += tela(
    "Financiamentos", "/financeiro/financiamentos",
    "Acompanha as vendas financiadas: qual financeira, qual veículo, quanto ela deve repassar e o "
    "retorno da operação.",
    [
        "Cada linha mostra o valor financiado, a situação e o quanto ainda há a receber.",
        "Quando o dinheiro da financeira cai, dê a baixa por aqui — o título de recebimento é quitado.",
        "As <b>contas das financeiras</b> aparecem consolidadas para conferência.",
    ],
)
story += tela(
    "Recorrentes", "/financeiro/recorrentes",
    "Lançamentos que se repetem todo mês (aluguel, contador, impostos, assinaturas), gerados "
    "automaticamente.",
    [
        "“+ Nova recorrência”: descrição, valor, dia do vencimento, categoria e se é a pagar ou a "
        "receber.",
        "Os títulos do mês são gerados sozinhos; “Gerar agora” antecipa a geração.",
        "<b>“Importar do documento”</b> lê um PDF (plano de contas do contador, carnê de imposto, "
        "fatura de cartão) e propõe as recorrências encontradas — você confere antes de criar.",
        "Encerrar uma recorrência para de gerar novos títulos sem apagar o histórico.",
    ],
)
story += tela(
    "Livro caixa", "/financeiro/livro-caixa",
    "O movimento realizado mês a mês: tudo o que entrou e saiu, com saldo inicial e final.",
    [
        "Navegue por mês e filtre por conta, texto, valor ou período.",
        "<b>“Novo lançamento”</b> registra entrada ou saída avulsa (tarifa bancária, venda de sucata) "
        "escolhendo fluxo, categoria, conta e, quando fizer sentido, o veículo, a peça ou o cliente.",
        "O <b>farol</b> no topo mostra a saúde dos números; enquanto estiver vermelho, novos "
        "lançamentos ficam bloqueados.",
        "Botão de <b>PDF</b> para imprimir o mês.",
    ],
)
story += tela(
    "Fluxo de caixa", "/financeiro/fluxo-caixa",
    "Consolidado de entradas e saídas realizadas nos últimos seis meses, para enxergar tendência.",
    ["Compare os meses no gráfico e na tabela.",
     "Serve para responder “estamos gerando ou consumindo caixa?” sem abrir título por título."],
)
story += tela(
    "Lucro / Prejuízo", "/financeiro/lucro-prejuizo",
    "O resultado da loja por regime de caixa, com o extrato que explica cada número.",
    [
        "Escolha o período; o cartão “Como chegamos nesse resultado” abre a composição linha a linha.",
        "O lucro dos veículos aparece separado das despesas de estrutura.",
        "É a tela para conferir antes de fechar o mês.",
    ],
)
story += tela(
    "Conciliação bancária", "/financeiro/conciliacao",
    "Compara o extrato do banco com o que está lançado no sistema.",
    [
        "Baixe o arquivo <b>OFX</b> no internet banking e importe aqui.",
        "O sistema casa automaticamente o que reconhece e lista o que sobrou dos dois lados.",
        "Para cada linha não casada, crie o lançamento na hora (categoria, fluxo, fornecedor ou "
        "cliente) ou aponte o título existente.",
    ],
)
story += tela(
    "Categorias", "/financeiro/categorias",
    "As categorias usadas nos lançamentos de despesa e receita.",
    ["Cadastre, renomeie ou exclua. <b>Renomear atualiza também os lançamentos passados</b>, então o "
     "histórico continua coerente."],
)
story.append(PageBreak())

# ============================================================ ADMINISTRATIVO
story += secao(
    "Administrativo",
    "Pessoas, sócios e a estrutura da loja",
    "O que não é venda nem título, mas aparece no resultado: folha, capital, frota, consórcios e a "
    "classificação dos lançamentos.",
)
story += tela(
    "Folha de pagamento", "/folha",
    "Funcionários, salários e encargos, com a folha do mês lançada no financeiro.",
    [
        "“Novo funcionário”: dados, salário e situação.",
        "<b>“Gerar folha do mês”</b> cria as contas a pagar de cada um; o que já foi gerado fica "
        "marcado.",
        "Desligamentos mantêm o histórico, sem sumir dos meses anteriores.",
    ],
)
story += tela(
    "Capital dos sócios", "/capital",
    "Quanto cada sócio colocou, tirou e tem a receber — dentro do sistema, batendo com o caixa.",
    [
        "Cadastre os beneficiários (sócios e terceiros com caução guardada).",
        "Lance <b>aportes</b>, <b>retiradas</b> e <b>pró-labore</b>; cada beneficiário tem extrato "
        "próprio.",
        "A tela mostra saldo investido, valor aplicado e saldo livre.",
        "<b>Contabilizar</b> acerta o saldo do sócio contra o administrativo sem mover dinheiro.",
    ],
)
story += tela(
    "Remuneração de estoque", "/capital/remuneracao-estoque",
    "Cobra juros sobre o capital preso nos carros do pátio: o valor entra no custo do veículo e é "
    "creditado como aporte aos sócios.",
    [
        "Informe o percentual e o rateio entre os beneficiários; a taxa incide sobre o valor já pago "
        "de cada veículo em estoque.",
        "A execução fica no <b>histórico de lotes</b>.",
        "Um lote pode ser <b>estornado</b> enquanto nenhum veículo dele tiver sido vendido.",
    ],
)
story += tela(
    "Combustíveis", "/combustiveis",
    "Abastecimentos da frota, integrados às contas a pagar.",
    [
        "Cadastre o preço por litro de cada combustível; ao lançar, informe o <b>valor</b> abastecido "
        "e o sistema calcula os litros.",
        "Informe motorista e veículo para acompanhar consumo por carro.",
    ],
)
story += tela(
    "Consórcios", "/consorcios",
    "Cartas de crédito com as parcelas lançadas automaticamente no financeiro.",
    ["“Novo consórcio”: administradora, valor da carta, parcela e prazo.",
     "As parcelas entram em Contas a pagar mês a mês.",
     "Contemplações e encerramentos ficam registrados na própria carta."],
)
story += tela(
    "Centros de custo", "/centros-custo",
    "Onde cada lançamento é classificado. Os três estruturais (Capital, Veículos, Administrativo) são "
    "automáticos; os demais você cria.",
    ["Crie centros para obras, imóveis ou frentes específicas e escolha-os ao lançar.",
     "Encerrar um centro tira ele das listas novas sem apagar o que já passou.",
     "O resultado por centro aparece na própria tela."],
)
story.append(PageBreak())

# ============================================================ RELATÓRIOS
story += secao(
    "Relatórios",
    "Os números para decidir",
    "Dois destinos: a central com todos os relatórios e o parecer analítico gerado por IA.",
)
story += tela(
    "Central de relatórios", "/relatorios",
    "Reúne DRE mensal, lucro por veículo, fluxo de caixa, tempo de estoque, despesas por categoria e "
    "capital imobilizado.",
    [
        "Cada relatório tem filtros próprios (período, veículo, categoria) e botão de PDF.",
        "<b>Lucro por veículo</b> é o mais usado no dia a dia: mostra o resultado de cada carro já com "
        "custos e comissões.",
        "<b>Tempo de estoque (aging)</b> destaca o que passou de 90 dias parado.",
    ],
)
story += tela(
    "Parecer IA", "/relatorios/parecer-ia",
    "Uma leitura analítica do momento da loja, escrita por IA a partir dos seus números, em PDF.",
    ["Configure a chave em Parâmetros › Parecer IA antes do primeiro uso.",
     "Gere o parecer geral da loja e use-o como pauta de reunião.",
     "O consumo aparece em Uso de IA."],
)
story.append(PageBreak())

# ============================================================ CADASTROS
story += secao(
    "Cadastros e configuração",
    "Quem, o quê e as regras da casa",
    "As telas de apoio: pessoas, documentos, usuários, permissões, parâmetros e as telas técnicas da "
    "instalação.",
)
story += tela("Clientes", "/clientes",
              "Cadastro dos clientes usados nas vendas e nos recebimentos.",
              ["Novo cliente com CPF/CNPJ, contato e endereço — a consulta por documento ajuda a "
               "preencher.",
               "Da ficha dá para ver o histórico de compras da pessoa."])
story += tela("Fornecedores", "/fornecedores",
              "Cadastro dos fornecedores usados nas compras e nos títulos a pagar.",
              ["Inclui dados bancários, que saem na ordem de pagamento.",
               "Todo usuário do sistema também pode ser escolhido como beneficiário."])
story += tela("Documentos da empresa", "/documentos-empresa",
              "Guarda contrato social, cartão CNPJ, alvarás e certidões da loja.",
              ["Anexe o arquivo com a data de validade; o sistema avisa o que está vencendo.",
               "Fica tudo no backup, junto com o resto dos dados."])
story += tela("Usuários", "/usuarios",
              "Quem acessa o sistema, com que papel e com quais permissões.",
              [
                  "<b>Primeiro acesso:</b> gere um <b>código de liberação</b> e passe para a pessoa. "
                  "Ela se cadastra sozinha na página de login e fica aguardando aprovação.",
                  "<b>Aprovar</b> diz apenas que a pessoa é da casa — quem libera as telas é o "
                  "<b>perfil de acesso</b> que você atribui em seguida.",
                  "Dá para trocar a senha de alguém, desativar o acesso e acompanhar pedidos de "
                  "“esqueci a senha”.",
              ])
story += tela("Perfis de acesso", "/usuarios/perfis",
              "Modelos de permissão (Vendedor, Financeiro, Gerente) para aplicar aos usuários sem "
              "marcar item por item.",
              ["Crie o perfil, marque as ações permitidas e aplique aos usuários.",
               "Mudou o perfil, muda para todos que o usam.",
               "Perfis podem ser copiados entre instalações."])
story += tela("Parâmetros da empresa", "/parametros",
              "Os dados da loja usados nos documentos impressos e as configurações dos módulos.",
              [
                  "<b>Dados da empresa:</b> razão social, CNPJ, endereço, telefone e logotipo — saem "
                  "em contratos, ordens e na vitrine.",
                  "<b>Renave:</b> integradora e estabelecimento, exigidos pela escrituração.",
                  "<b>Comunicação de venda:</b> prestadora, valor do comunicado e do cancelamento e "
                  "dia do vencimento — é o que liga a cobrança automática do SICOVE.",
                  "<b>Financiamento na vitrine:</b> taxas por financeira usadas no simulador público.",
                  "<b>Parecer IA:</b> chave do provedor de inteligência artificial.",
              ])
story += tela("Uso da plataforma", "/sistema/uso",
              "Volume de dados da sua instalação: registros, anexos e armazenamento.",
              ["Consulte antes de subir muitos arquivos pesados.",
               "Traz também as regras e garantias do plano."])
story += tela("Assinatura", "/sistema/assinatura",
              "O contrato com o fornecedor do sistema, o histórico de mensalidades e os documentos da "
              "plataforma.",
              [
                  "Acompanhe status, plano, valor e próxima cobrança.",
                  "O contrato de licenciamento é gerado já preenchido, pronto para baixar, imprimir e "
                  "assinar; a via assinada é anexada aqui.",
                  "<b>Documentos do sistema:</b> nesta mesma tela ficam a apresentação comercial e "
                  "este manual, sempre na versão atual, para baixar ou enviar.",
              ])
story += tela("Sistema, Uso de IA e Desempenho", "/sistema",
              "Telas técnicas da instalação: backup e limpeza, consumo das leituras com IA e medição "
              "de desempenho.",
              [
                  "<b>Backup</b> baixa todos os dados em um arquivo; guarde uma cópia fora do sistema.",
                  "<b>Uso de IA</b> mostra o consumo por funcionalidade, por mês e as últimas "
                  "chamadas.",
                  "<b>Desempenho</b> mede onde o tempo é gasto — útil quando alguma tela parecer "
                  "lenta.",
                  "Algumas dessas telas são exclusivas do fornecedor do sistema.",
              ])
story += tela("Minhas comissões", "/minhas-comissoes",
              "Autoatendimento: cada pessoa vê as próprias comissões, pagas e a pagar.",
              ["Aparece para todo usuário, sem depender de permissão.",
               "Mostra a venda de origem e a situação de cada comissão."])

story.append(CondPageBreak(40 * mm))
story.append(caixa([
    p("<b>Não achou uma tela?</b> Ou ela não está liberada no seu perfil, ou é exclusiva do fornecedor "
      "do sistema. E se alguma rotina da sua loja não estiver contemplada, ela pode virar "
      "funcionalidade: o sistema é desenvolvido em cima da operação real e melhorias pedidas entram em "
      "dias.", "card_p"),
], fundo=AZUL_F, borda=AZUL_B))

gerar(SAIDA, story, "Fincore360 ERP - Manual do sistema",
      "Manual de uso: o que cada tela do menu faz e como usar",
      rodape="Fincore360 ERP · Manual do sistema")
