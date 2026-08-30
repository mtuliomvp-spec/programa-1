# -*- coding: utf-8 -*-
"""Apresentação comercial do Fincore360 ERP — versão atualizada."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.units import mm
from reportlab.platypus import Image, NextPageTemplate, PageBreak, Spacer, Table, TableStyle

from estilo_fincore import (
    AMBAR_B, AMBAR_F, AZUL, AZUL_B, AZUL_F, BRANCO, LARGURA_UTIL, S,
    caixa, esp, gerar, grade, li, linha_stats, p, secao, tabela,
)

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SAIDA = os.path.join(RAIZ, "public/documentos/fincore360-apresentacao.pdf")
QR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "qr-whats.png")

story = []

# ============================================================ CAPA
story.append(Spacer(1, 92 * mm))
story.append(p(esp("Apresentação do sistema"), "kicker_claro"))
story.append(p("A revenda inteira", "h1_capa"))
story.append(p("sob controle", "h1_capa2"))
story.append(p(
    "Do carro que entra no pátio ao lucro que sobra no fim do mês: estoque, vendas, financiamento, "
    "caixa, capital dos sócios e contabilidade gerencial em um só lugar — com o financeiro conferido "
    "pelo próprio sistema, todos os dias.", "lead_escuro"))
story.append(Spacer(1, 9 * mm))
story.append(linha_stats([
    ("12", "módulos integrados"),
    ("109", "telas de trabalho"),
    ("47", "permissões por ação"),
    ("8", "leitores com IA"),
]))
story.append(NextPageTemplate("padrao"))
story.append(PageBreak())

# ============================================================ 02 VISÃO GERAL
story += secao(
    "Visão geral",
    "Um ERP feito para revenda de veículos — não um genérico adaptado às pressas",
    "Cada tela nasceu de uma rotina real de loja: comprar o carro, preparar, anunciar, vender, "
    "financiar, pagar o fornecedor, acertar a comissão e saber exatamente quanto sobrou. Tudo "
    "conversa entre si — lançar em um lugar reflete em todos os outros, sem digitar duas vezes.",
)
story.append(grade([
    ("🚗 Operação",
     "Estoque, avaliações, vendas, financiamento de terceiros, peças e solicitações de compra — "
     "com documentos gerados automaticamente."),
    ("💳 Financeiro",
     "Contas e caixas, a pagar e a receber, conciliação bancária, livro caixa, fluxo de caixa e "
     "resultado por regime de caixa."),
    ("💼 Administrativo",
     "Capital dos sócios, folha, combustíveis, consórcios, centros de custo e documentos da empresa."),
    ("📈 Inteligência",
     "Relatórios gerenciais, DRE mensal, lucro por veículo, tempo de estoque e leitura automática "
     "de documentos com IA."),
]))
story.append(caixa([
    p("<font color='#2563EB'><b>O diferencial: o sistema confere a si mesmo</b></font>", "card_t"),
    p("Um <b>farol de integridade</b> roda em tempo real com dois testes: (1) o saldo das contas bate "
      "com o caixa e com o extrato; (2) a equação patrimonial bate com o Lucro/Prejuízo apurado. Se "
      "algo divergir, o sistema <b>avisa e bloqueia novos lançamentos</b> até acertar. Na prática, a "
      "loja não fecha o mês com número errado — e o contador recebe um material que fecha.", "card_p"),
], fundo=AZUL_F, borda=AZUL_B))
story.append(Spacer(1, 5 * mm))
story.append(grade([
    ("🔑 Cada um vê o que precisa",
     "47 permissões separadas por ação. O vendedor pode registrar a venda sem ver o custo do carro; o "
     "financeiro paga sem acessar o capital dos sócios. Perfis prontos aceleram o cadastro de novos "
     "usuários."),
    ("📱 Funciona no balcão e na rua",
     "Interface responsiva: o vendedor usa no celular durante o atendimento, o escritório usa no "
     "computador. Sem instalação, sem servidor na loja — é só abrir o navegador."),
]))
story.append(caixa([
    p("<b>Tudo puxa tudo.</b> O custo lançado no carro já nasce como conta a pagar; a venda registrada "
      "já gera as parcelas a receber e a comissão do vendedor; o pagamento baixado já entra no livro "
      "caixa e no resultado do mês. Uma informação, um lançamento — em todos os lugares onde ela "
      "precisa aparecer.", "card_p"),
], barra=AZUL, fundo=BRANCO))
story.append(PageBreak())

# ============================================================ 03 OPERAÇÃO 1
story += secao(
    "Operação · 01",
    "Estoque de veículos e vitrine pública",
    "A ficha do carro concentra tudo: dados do documento, o que foi gasto na preparação, o que ainda "
    "falta pagar, o tempo de pátio e a margem real. E o mesmo cadastro já publica o veículo no site "
    "da loja.",
)
story.append(grade([
    ("🔍 Cadastro sem digitação",
     "A busca pela placa preenche marca, modelo, versão, ano, cor, combustível e câmbio. Chassi e "
     "RENAVAM são validados na hora."),
    ("🧾 Custo real, carro a carro",
     "Compra, preparação, peças aplicadas, guias e taxas: cada gasto entra na ficha e forma o custo "
     "que vai aparecer no lucro da venda."),
    ("📄 Documentação em dia",
     "CRLV e ATPV-e anexados são lidos pela IA; o livro Renave de entradas e saídas é escriturado a "
     "partir dos mesmos dados."),
    ("🌐 Vitrine pública inclusa",
     "Um clique publica o carro no site da loja, com galeria, selo de novidade, simulador de "
     "financiamento e contato direto no WhatsApp."),
    ("📋 Papelada da compra",
     "Ordem de compra e contrato saem prontos, numerados e com os dados da empresa — inclusive no "
     "modelo Renave."),
    ("⏱️ Nada parado sem aviso",
     "O tempo de pátio de cada carro fica à vista, com destaque para o que passou de 90 dias."),
]))
story.append(caixa([
    p("<b>Avaliação de veículos de terceiros.</b> Módulo próprio para avaliar o carro do cliente: "
      "checklist, fotos, FIPE, valor da loja × valor pedido pelo proprietário, e um PDF de avaliação "
      "pronto para enviar. Na entrega, o mesmo checklist é reconferido item a item e o sistema aponta "
      "as divergências.", "card_p"),
    Spacer(1, 4),
    p("<b>Novo: repasse na vitrine.</b> O carro avaliado que a loja não comprou pode ser anunciado no "
      "mesmo site, marcado com a tarja <b>REPASSE</b> sobre as fotos. O anúncio mostra só a ficha e as "
      "imagens — valor avaliado, pedido do proprietário e placa nunca aparecem.", "card_p"),
    Spacer(1, 4),
    p("<b>Novo: cobrir a placa.</b> Em qualquer foto — da avaliação ou do veículo do estoque — basta "
      "tocar nos quatro cantos da placa: a tarja assume a forma exata dela, mesmo inclinada, e não "
      "invade a lataria. O editor amplia até 6×, para a foto tirada de longe. A foto original sai do "
      "ar no mesmo instante.", "card_p"),
], fundo=AZUL_F, borda=AZUL_B))
story.append(PageBreak())

# ============================================================ 04 OPERAÇÃO 2
story += secao(
    "Operação · 02",
    "Vendas, financiamento e o resultado de cada negócio",
    "A venda é montada como pré-venda, revisada com calma e só então efetivada — quando o financeiro "
    "inteiro é gerado de uma vez: recebimentos, comissões, repasse da financeira e baixa do estoque.",
)
story.append(tabela([
    ["Etapa", "O que acontece"],
    ["1 · Pré-venda", "Cliente, veículo, forma de pagamento e contrato — sem mexer no financeiro ainda."],
    ["2 · Conferência", "Resumo do negócio com entrada, parcelas, troca, comissões e o lucro previsto."],
    ["3 · Efetivação", "Um clique gera contas a receber, comissões a pagar e baixa o carro do estoque."],
], [30 * mm, 135 * mm]))
story.append(Spacer(1, 5 * mm))
story.append(grade([
    ("💵 Toda forma de negócio",
     "À vista, parcelado com entrada, financiado, com troca na entrada e com indicação de terceiros — "
     "cada modalidade gera os títulos certos."),
    ("🤝 Financiamento de terceiros",
     "Quando a loja só intermedeia o financiamento de um carro que não é dela, a operação tem tela "
     "própria, contrato de intermediação e comissão apurada."),
    ("💰 Comissões sem discussão",
     "A comissão do vendedor nasce junto com a venda e vira ordem de pagamento com os dados bancários "
     "do beneficiário. Cada um acompanha as suas em tela própria."),
    ("🛡️ Segurança na negociação",
     "Consulta de débitos do veículo, leitura das guias de IPVA, multa e licenciamento, e desconto "
     "automático no acerto com o proprietário."),
]))
story.append(caixa([
    p("<b>Peças e solicitações de compra.</b> Almoxarifado com estoque mínimo, venda de balcão e peça "
      "vinculada ao veículo que a consumiu. As compras seguem o fluxo solicitação → aprovação → conta "
      "a pagar, com anexo da foto ou do orçamento pelo celular. A nota do fornecedor é lida pela IA e "
      "vira título com a nota já anexada.", "card_p"),
], barra=AZUL, fundo=BRANCO))
story.append(PageBreak())

# ============================================================ 05 FINANCEIRO
story += secao(
    "Financeiro",
    "O financeiro que a revenda precisa — do boleto ao resultado",
    "Nada é lançado solto: todo título nasce ligado ao carro, à peça, à venda ou ao sócio. É isso que "
    "permite dizer, com segurança, quanto cada negócio deu de lucro.",
)
story.append(grade([
    ("💳 Contas, caixas e caixa diário",
     "Caixas, bancos, financeiras e contas de aplicação; abertura e fechamento de caixa com data de "
     "trabalho; transferências entre contas e boletim diário."),
    ("📤 Contas a pagar",
     "Filtros por fornecedor, veículo, beneficiário e período; pagamento em lote; pagamento parcial; "
     "combos que quitam vários títulos com um borderô só."),
    ("📥 Contas a receber",
     "Baixa com observação, recebimento parcial, controle do que está atrasado e ligação direta com a "
     "venda que originou o título."),
    ("🏦 Conciliação bancária",
     "Importe o extrato em OFX e o sistema casa cada linha com o que já está lançado, apontando o que "
     "falta e o que sobra."),
    ("🚗 Financiamentos e repasses",
     "Vendas financiadas com o valor a receber de cada financeira, prazo e baixa quando o dinheiro "
     "cai."),
    ("🔁 Recorrentes e cartão",
     "Aluguel, contador, impostos e assinaturas lançados sozinhos todo mês; fatura de cartão "
     "importada e conferida item a item."),
]))
story.append(caixa([
    p("<font color='#2563EB'><b>Resultado por regime de caixa — o que de fato entrou e saiu</b></font>",
      "card_t"),
    p("Lucro/Prejuízo, DRE mensal, fluxo de caixa e livro caixa apurados sobre o dinheiro movimentado, "
      "com o lucro de cada veículo separado das despesas da estrutura. O fechamento mensal tranca o "
      "mês conferido: ninguém lança no passado por engano, e o número apresentado ao contador não muda "
      "depois.", "card_p"),
], fundo=AZUL_F, borda=AZUL_B))
story.append(Spacer(1, 4 * mm))
story.append(caixa([
    p("<b>Novo: comunicação de venda automática.</b> Ao anexar o comprovante do SICOVE na ficha do "
      "veículo, o sistema reconhece o serviço (comunicado ou cancelamento), lança a conta a pagar com "
      "o valor e o vencimento certos e ainda confere a fatura mensal da prestadora contra os "
      "comunicados do mês.", "card_p"),
], barra=AZUL, fundo=BRANCO))
story.append(PageBreak())

# ============================================================ 06 GOVERNANÇA
story += secao(
    "Controle e governança",
    "Capital dos sócios e o controle de quem faz o quê",
    "A parte que costuma ficar em planilha paralela — quanto cada sócio colocou, tirou e tem a receber "
    "— fica dentro do sistema, batendo com o caixa e com o patrimônio da empresa.",
)
story.append(grade([
    ("💼 Capital individualizado",
     "Aportes, retiradas e pró-labore por sócio, com extrato próprio; saldo investido, valor aplicado "
     "e saldo livre de cada um; caução de terceiros guardada em nome do responsável."),
    ("📈 Remuneração do capital",
     "Juros sobre o capital preso no estoque: o percentual entra no custo do carro e é creditado como "
     "aporte aos sócios, com rateio livre."),
    ("👥 Pessoas",
     "Folha de pagamento com encargos, funcionários e beneficiários; combustíveis da frota integrados "
     "às contas a pagar."),
    ("🔒 Proteções do sistema",
     "Bloqueio do sistema em manutenção, trava de lançamento com o caixa fechado, fechamento mensal, "
     "histórico de acessos e quem está online agora."),
    ("📁 Documentos da empresa",
     "Contrato social, cartão CNPJ, alvarás e certidões guardados no próprio sistema, com aviso de "
     "vencimento."),
    ("⚙️ A loja do seu jeito",
     "Dados da empresa, categorias, centros de custo, perfis de acesso e parâmetros de Renave, "
     "comunicação de venda e financiamento — tudo configurável."),
]))
story.append(caixa([
    p("<b>Centros de custo e categorias.</b> Todo lançamento cai em um dos três fluxos estruturais — "
      "Capital, Veículos ou Administrativo — e em uma categoria personalizável. É o que separa, no fim "
      "do mês, o que é resultado de carro do que é custo de estrutura.", "card_p"),
], barra=AZUL, fundo=BRANCO))
story.append(PageBreak())

# ============================================================ 07 IA
story += secao(
    "Inteligência artificial aplicada",
    "O documento chega em PDF — o sistema lê e lança",
    "Oito leitores com IA transformam papelada em lançamento pronto. O usuário só confere e confirma: "
    "nenhum dado é gravado sem revisão, e o sistema nunca sobrescreve informação já preenchida.",
)
story.append(grade([
    ("📑 Contrato de compra",
     "Anexe o contrato no cadastro do veículo: dados do carro, valores e o fornecedor entram sozinhos. "
     "O contrato fica anexado à ficha."),
    ("🧾 NF-e / DANFE de peças",
     "Várias notas de uma vez: cria os títulos que faltam, anexa a nota ao título certo e ainda lê "
     "quais peças foram compradas."),
    ("✅ Comprovantes de pagamento",
     "Um PDF com vários comprovantes do banco: o sistema separa página por página e anexa cada um ao "
     "seu título — pago ou ainda em aberto."),
    ("📊 Relatório de duplicatas",
     "Relatório do fornecedor com dezenas de notas: identifica o que ainda não está lançado e cria os "
     "títulos que faltam."),
    ("🪪 CRLV e ATPV-e",
     "O documento do veículo preenche RENAVAM, chassi, ano e mais; a ATPV-e ainda traz o número do CRV "
     "e o código de segurança exigidos pelo Renave."),
    ("💳 Fatura de cartão e boletos",
     "Fatura importada item a item; boletos e guias lidos com valor, vencimento e beneficiário, já "
     "aplicados ao título certo."),
]))
story.append(caixa([
    p("<b>Como a leitura é tratada.</b> O que a IA devolve passa por conferência do sistema antes de "
      "virar dado: valores são comparados com o que já está cadastrado, divergências viram aviso — "
      "nunca substituição silenciosa — e o arquivo original fica anexado como comprovante. O consumo "
      "de IA da instalação é medido e fica visível em tela própria.", "card_p"),
], fundo=AMBAR_F, borda=AMBAR_B))
story.append(PageBreak())

# ============================================================ 08 DOCUMENTOS
story += secao(
    "Documentos e relatórios",
    "Tudo o que a loja precisa imprimir, o sistema já entrega pronto",
    "Documentos com os dados da empresa, numeração própria e envio por WhatsApp em um toque — sem "
    "Word, sem modelo desatualizado circulando entre computadores.",
)
story.append(grade([
    ("📃 Documentos gerados",
     "Ordem de compra, contrato de compra e venda (inclusive no modelo Renave), contrato de "
     "intermediação, ordem de pagamento, borderô do combo, recibo, PDF de avaliação e ficha do "
     "veículo com QR de conferência."),
    ("📲 Entrega ao cliente",
     "Cada documento vira PDF ou vai direto para o WhatsApp do cliente, com a mensagem pronta. Links "
     "públicos de conferência permitem validar a ficha e o pagamento sem login."),
]))
story.append(Spacer(1, 2 * mm))
story.append(p("Relatórios gerenciais inclusos", "h2"))
story.append(tabela([
    ["Relatório", "O que responde"],
    ["DRE mensal", "Receitas, custos, despesas e lucro líquido, mês a mês"],
    ["Lucro por veículo", "Quanto cada carro deu de resultado, já com custos e comissões"],
    ["Fluxo de caixa", "Entradas e saídas realizadas, comparando os meses"],
    ["Tempo de estoque (aging)", "Quanto tempo cada carro está parado e o que passou de 90 dias"],
    ["Despesas por categoria", "Onde o dinheiro da estrutura está indo"],
    ["Capital imobilizado", "Quanto de capital está preso no pátio hoje"],
    ["Painel inicial", "Saldo em caixa, estoque, a pagar, a receber e vendas do mês"],
    ["Parecer IA", "Leitura analítica do momento da loja, em PDF, pronta para discutir em reunião"],
], [45 * mm, 120 * mm]))
story.append(PageBreak())

# ============================================================ 09 CONTRATAÇÃO
story += secao(
    "Como funciona a contratação",
    "Na nuvem, com o domínio da sua loja e atualizações automáticas",
    "Cada empresa recebe a sua própria instalação, com banco de dados isolado e endereço próprio. "
    "Nada é compartilhado entre clientes — e toda melhoria chega para todos ao mesmo tempo.",
)
story.append(grade([
    ("🔐 Seus dados são só seus",
     "Banco de dados exclusivo por cliente, com backup completo em um clique e exportação a qualquer "
     "momento."),
    ("🔄 Sempre atualizado",
     "As melhorias entram em produção sozinhas, sem parada e sem custo de versão. Nenhuma atualização "
     "manual na loja."),
    ("🌐 Sua marca na frente",
     "Domínio próprio, logotipo e dados da empresa em todos os documentos e na vitrine pública."),
    ("🚀 Implantação rápida",
     "Cadastro da empresa, usuários, contas e estoque inicial — a loja começa a operar no mesmo dia."),
]))
story.append(caixa([
    p("<font color='#2563EB'><b>Construído em cima de uma operação real</b></font>", "card_t"),
    p("O sistema não nasceu de um projeto teórico: ele roda todos os dias em uma revenda, e cada função "
      "existe porque uma necessidade concreta apareceu no balcão. É por isso que ele resolve o detalhe "
      "que os sistemas genéricos deixam passar — a comissão que virou aporte, o carro que entrou na "
      "troca, a nota do fornecedor que ninguém lançou.", "card_p"),
], fundo=AZUL_F, borda=AZUL_B))
story.append(Spacer(1, 4 * mm))
story.append(caixa([
    p("<b>Quem cuida do sistema.</b> O desenvolvimento é contínuo e acompanhado de perto: melhorias "
      "pedidas pela operação entram em dias, não em versões anuais. Cada alteração é revisada e "
      "testada antes de subir, e a demonstração pública roda sempre a mesma versão da produção.",
      "card_p"),
], barra=AZUL, fundo=BRANCO))
story.append(PageBreak())

# ============================================================ 10 PRÓXIMO PASSO
story += secao(
    "Próximo passo",
    "Veja funcionando com dados reais de loja",
    "A demonstração é um ambiente completo, com estoque, vendas, financeiro e capital já preenchidos. "
    "Em 20 minutos dá para percorrer o caminho inteiro: comprar um carro, vender, pagar o fornecedor e "
    "ver o lucro aparecer no relatório.",
)
story.append(grade([
    ("1 · Demonstração", "Apresentação guiada do sistema, no seu ritmo e com as suas dúvidas."),
    ("2 · Ambiente de teste", "Sua equipe usa por alguns dias, sem risco para dado nenhum."),
    ("3 · Implantação", "Instalação própria, domínio da loja e acompanhamento na virada."),
], colunas=3))
story.append(Spacer(1, 4 * mm))

contato = [
    [
        [p(esp("Fale com"), "kicker"),
         p("<b>Gabriel Viana Pereira</b>", "h2"),
         p("(98) 99167-3123", "card_t"),
         p("Aponte a câmera do celular para o código e o WhatsApp abre com a conversa pronta.",
           "card_p")],
        Image(QR, width=30 * mm, height=30 * mm),
    ],
]
t = Table(contato, colWidths=[LARGURA_UTIL - 36 * mm, 36 * mm], hAlign="LEFT")
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("BACKGROUND", (0, 0), (-1, -1), AZUL_F),
    ("BOX", (0, 0), (-1, -1), 0.7, AZUL_B),
    ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 12),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
]))
story.append(t)
story.append(Spacer(1, 5 * mm))
story.append(p(
    "Fincore360 ERP · sistema de gestão para revendas de veículos · demonstração pública em "
    "programa-1-demo.vercel.app", "nota"))

gerar(SAIDA, story, "Fincore360 ERP - Apresentacao do sistema",
      "Apresentacao comercial do Fincore360 ERP")
