# -*- coding: utf-8 -*-
"""Relatório comercial: vantagens do Fincore360 sobre a integradora Trillia (ControlStock)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "geradores"))

from reportlab.lib.units import mm
from reportlab.platypus import NextPageTemplate, PageBreak, Spacer

from estilo_fincore import (
    AMBAR_B, AMBAR_F, AZUL, AZUL_B, AZUL_F, caixa, esp, gerar, grade, li, linha_stats, p, secao, tabela,
)

SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fincore360-vantagens-sobre-trillia.pdf")
L = 165 * mm
story = []

# ============================================================ CAPA
story.append(Spacer(1, 80 * mm))
story.append(p(esp("Relatório comparativo"), "kicker_claro"))
story.append(p("Fincore360 × Trillia", "h1_capa"))
story.append(p("o sistema inteiro, não só o Renave", "h1_capa2"))
story.append(p(
    "Por que a loja que usa o Fincore360 não precisa contratar uma integradora do Renave: o registro "
    "de entrada e saída, a ATPV-e e toda a gestão da loja ficam num lugar só, sem intermediário e sem "
    "redigitar dados.", "lead_escuro"))
story.append(Spacer(1, 9 * mm))
story.append(linha_stats([
    ("0", "integradoras no meio"),
    ("R$ 0", "de taxa de integradora"),
    ("1", "sistema para a loja inteira"),
    ("0", "dados redigitados"),
]))
story.append(NextPageTemplate("padrao"))
story.append(PageBreak())

# ============================================================ RESUMO
story += secao(
    "Resumo",
    "A diferença em uma frase",
    "A Trillia vende um serviço: cumprir o Renave pelo painel dela (ControlStock). O Fincore360 é o "
    "sistema de gestão da loja, e o Renave já vem dentro dele, ligado direto ao SERPRO.",
)
story.append(tabela([
    ["", "Trillia (ControlStock)", "Fincore360"],
    ["O que é", "Integradora do Renave: intermediária entre a loja e o SERPRO.",
     "ERP completo da revenda, com o Renave integrado direto ao SERPRO."],
    ["Escopo", "Só o Renave: entrada e saída do veículo no estoque e ATPV-e.",
     "Estoque, vendas, financeiro, documentação, pendências, relatórios, vitrine, NF-e/NFS-e, "
     "chat de ajuda <b>e</b> o Renave."],
    ["Como registra", "No painel dela, campo a campo. Na negociação, a API ainda não estava liberada.",
     "Pelo próprio sistema, com os dados que já estão na ficha do carro e na venda."],
    ["ATPV-e", "Gerada pelo Renave, acessada pelo painel da integradora.",
     "Gerada pelo Renave na saída e <b>anexada sozinha</b> na ficha do carro, com o termo de saída."],
    ["Cobrança", "Por registro, somada às taxas do SERPRO.",
     "Mensalidade fixa (R$ 399 ou R$ 599), com o Renave incluído. Sem taxa de intermediário."],
    ["Dados da loja", "Ficam em dois lugares: no sistema da loja e no painel da integradora.",
     "Num lugar só, com backup e controle de acesso por usuário."],
    ["Dependência", "A loja depende da integradora para operar o Renave.",
     "A loja usa o próprio contrato com o SERPRO e o próprio certificado e-CNPJ."],
], [26 * mm, 66 * mm, 73 * mm]))
story.append(Spacer(1, 8))
story.append(caixa([
    p("<b>De onde vêm as informações da Trillia.</b> Da negociação da MVP Veículos com a "
      "integradora (Stok-e / Trillia, painel ControlStock) entre agosto e outubro de 2026, registrada "
      "no sistema: cobrança por registro, API não liberada e contrato não assinado (\"em avaliação\"). "
      "Em outubro de 2026 o SERPRO confirmou que o contrato da loja permite o acesso direto ao Renave, "
      "e a integradora deixou de ser necessária. Confira valores atuais na proposta da Trillia.", "nota"),
], fundo=AMBAR_F, borda=AMBAR_B))

story.append(PageBreak())

# ============================================================ RENAVE
story += secao(
    "Renave e ATPV-e",
    "O mesmo registro oficial, sem intermediário",
    "O que a Trillia entregaria, o Fincore360 entrega dentro do sistema, partindo de dados que a loja "
    "já cadastrou.",
)
story.append(p("Com a integradora", "h2"))
for t in [
    "A loja cadastra o carro e a venda no próprio sistema.",
    "Depois abre o painel da integradora e <b>digita de novo</b> placa, RENAVAM, chassi, CRV, vendedor, "
    "comprador, valores e chaves das notas. Na MVP foi preciso criar o botão \"Copiar dados para o "
    "ControlStock\" só para diminuir esse retrabalho.",
    "Paga a integradora a cada registro, além das taxas do SERPRO.",
    "Baixa a ATPV-e no painel dela e guarda onde der.",
]:
    story.append(li(t))
story.append(p("Com o Fincore360", "h2"))
for t in [
    "<b>Aptidão</b> do veículo consultada na ficha, antes da compra.",
    "<b>Entrada no estoque</b> (compra ou veículo próprio) enviada ao Renave com os dados da ficha; a "
    "assinatura do vendedor e a NF-e de entrada seguem pelo mesmo card.",
    "<b>Saída (venda)</b> enviada com os dados do comprador que já estão na venda. "
    "<b>O Renave gera a ATPV-e</b> nesse momento.",
    "A <b>ATPV-e e o termo de saída</b> são baixados e anexados na ficha do carro com um clique; a chave "
    "da NF-e de venda fecha o registro.",
    "Cancelamento de entrada ou de saída, consulta do estoque no Renave e livro de entradas e saídas, "
    "tudo na mesma tela.",
    "Quando o carro não passa pelo Renave (estado sem adesão), a ATPV-e do DETRAN ou do despachante é "
    "lida pelo sistema e acompanhada por fases: emitida, preenchida, assinada e termo.",
]:
    story.append(li(t))
story.append(Spacer(1, 6))
story.append(caixa([
    p("<b>O que a loja precisa para o acesso direto:</b> certificado e-CNPJ A1, contrato com o SERPRO e "
      "o DETRAN do estado operando o Renave. O sistema mostra, em Parâmetros › Renave, o que falta e "
      "traz um passo a passo da adequação e um assistente de preenchimento.", "nota"),
], fundo=AZUL_F, borda=AZUL_B))

story.append(PageBreak())

# ============================================================ O QUE SÓ O FINCORE ENTREGA
story += secao(
    "Além do Renave",
    "O que a integradora não entrega",
    "A integradora resolve uma obrigação. O Fincore360 organiza a loja inteira — e o Renave é só uma das "
    "telas.",
)
story.append(grade([
    ("Estoque com documentação viva",
     "Ficha do carro com CRLV lido por IA, fotos, custos, orçamento do despachante, selos de "
     "transferência, comunicação de venda e foto do cliente (antifraude)."),
    ("Vendas e pré-vendas",
     "Ficha de negócio, contrato, consignado, troca, financiamento, comissões e indicações; uma pré-venda "
     "aberta por veículo, com registro de quem criou."),
    ("Financeiro completo",
     "Contas a pagar e a receber, livro caixa, contas e caixas, combos de pagamento, recorrentes (até "
     "\"a cada N anos\") e conferência de comprovantes."),
    ("Resultado confiável",
     "Lucro por veículo, DRE, fluxos por conta e um farol de integridade que trava lançamentos quando "
     "os números não fecham."),
    ("Pendências num lugar só",
     "Notas de retorno e seguro, recebimentos, vendidos sem processo de transferência, sem comunicação "
     "de venda, CRLV pendente, contas vencidas."),
    ("Notas fiscais",
     "NF-e de entrada e de venda e NFS-e dos retornos pela Focus NFe (opcional), sem sair do sistema."),
    ("Financiamento de terceiros",
     "Operação completa de intermediação, com quitação de débitos, devolução e documentação do veículo."),
    ("Vitrine e simulador",
     "Site com os carros à venda, contador de visitas, contato pelo WhatsApp e simulador de "
     "financiamento."),
    ("Leitura de documentos por IA",
     "CRLV, ATPV-e, boletos, notas, comprovantes e orçamentos do despachante preenchem os campos "
     "sozinhos."),
    ("Chat de ajuda",
     "Assistente que explica o sistema e consulta os dados da loja respeitando as permissões de cada "
     "usuário."),
    ("Permissões por usuário",
     "Cada pessoa vê só o que pode: módulo por módulo e ação por ação, com histórico de acessos."),
    ("Em nuvem, com backup",
     "Acesso pelo computador e pelo celular, banco próprio da loja, backup e atualizações incluídos."),
], colunas=2))

story.append(PageBreak())

# ============================================================ CUSTOS
story += secao(
    "Custos",
    "Pagar por registro × mensalidade com tudo",
    "Com a integradora, cada entrada e cada saída gera uma cobrança. No Fincore360 o Renave está dentro "
    "da mensalidade.",
)
story.append(p("Simulação ilustrativa do custo de integradora (só o Renave)", "h2"))
story.append(p(
    "Cada carro gera dois registros: entrada (compra) e saída (venda). A tabela usa preços públicos de "
    "integradoras do mercado em 2026 — R$ 19,99 por requisição e R$ 28,80 por veículo na entrada — "
    "como referência. <b>Não é o preço da Trillia</b>: substitua pelo valor da proposta dela.", "p"))
story.append(tabela([
    ["Carros por mês", "Registros por mês", "A R$ 19,99 por registro", "A R$ 28,80 por registro"],
    ["10", "20", "R$ 399,80", "R$ 576,00"],
    ["20", "40", "R$ 799,60", "R$ 1.152,00"],
    ["40", "80", "R$ 1.599,20", "R$ 2.304,00"],
], [32 * mm, 36 * mm, 48 * mm, 49 * mm]))
story.append(Spacer(1, 4))
story.append(p(
    "Ou seja: a partir de uns 10 carros por mês, só o custo da integradora já se aproxima ou passa da "
    "mensalidade inteira do Fincore360 — que traz o sistema completo.", "nota"))
story.append(p("Planos do Fincore360", "h2"))
story.append(tabela([
    ["Plano", "Mensalidade", "Leituras de documento por IA", "Renave direto"],
    ["Essencial", "R$ 399/mês", "150 por mês (excedente R$ 0,40)", "Incluído"],
    ["Completo", "R$ 599/mês", "500 por mês (excedente R$ 0,40)", "Incluído"],
], [30 * mm, 32 * mm, 66 * mm, 37 * mm]))
story.append(Spacer(1, 4))
story.append(p(
    "Implantação de R$ 790 (grátis para pedidos até 15/11/2026). O mesmo sistema nos dois planos; muda só "
    "a franquia de leituras por IA.", "nota"))
story.append(p("Pago à parte nos dois casos", "h2"))
for t in [
    "Taxas do SERPRO pelo Renave (e do DETRAN, nos estados que cobram).",
    "Certificado digital e-CNPJ A1 da loja.",
    "No Fincore360, opcionais: Focus NFe (para emitir notas pelo sistema) e consulta por placa.",
]:
    story.append(li(t))

story.append(PageBreak())

# ============================================================ RISCOS
story += secao(
    "Riscos e controle",
    "Menos gente no meio, menos coisa para dar errado",
)
story.append(tabela([
    ["Ponto", "Com a integradora", "Com o Fincore360"],
    ["Erro de digitação", "Dados redigitados no painel: placa, CRV, valores, comprador.",
     "Os dados saem da ficha e da venda, já conferidos pelas leituras de documento."],
    ["Dependência", "Se a integradora parar, atrasar a API ou mudar o preço, a loja fica presa.",
     "Contrato da loja direto com o SERPRO; o sistema só usa o certificado da própria loja."],
    ["Rastreabilidade", "Registro do Renave separado da compra, da venda e do financeiro.",
     "Entrada, saída, ATPV-e, notas, transferência e pagamentos na mesma ficha do carro."],
    ["Segurança", "Os dados da loja passam por mais uma empresa.",
     "Certificado e tokens guardados cifrados; cada loja tem o próprio banco."],
    ["Prazo do Renave", "Depende do cronograma da integradora.",
     "Passo a passo da adequação, assistente e avisos das janelas do piloto dentro do sistema."],
], [30 * mm, 65 * mm, 70 * mm]))
story.append(Spacer(1, 10))
story.append(caixa([
    p("<b>Conclusão.</b> A integradora resolve só o Renave, cobra por registro e obriga a redigitar os "
      "dados num painel separado. O Fincore360 faz o mesmo registro oficial — inclusive a ATPV-e — direto "
      "no SERPRO, a partir do que a loja já cadastrou, e ainda organiza estoque, vendas, financeiro e "
      "documentação por uma mensalidade fixa.", "p"),
], barra=AZUL))
story.append(Spacer(1, 8))
story.append(p(
    "Fontes dos preços de referência: integrarenave.com (R$ 19,99 por requisição, sem mensalidade) e "
    "revendamais.com.br (referência de R$ 28,80 por veículo na entrada). Informações da Trillia: "
    "negociação da MVP Veículos, ago–out/2026. Documento de 08/11/2026.", "nota"))

gerar(SAIDA, story, "Fincore360 × Trillia — vantagens", "Relatório comparativo",
      rodape="Fincore360 ERP · Relatório comparativo")
