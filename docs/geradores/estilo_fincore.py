# -*- coding: utf-8 -*-
"""Identidade visual dos PDFs do Fincore360 (mesma da apresentação atual)."""

import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

# Paleta lida da apresentação original
ESCURO = colors.HexColor("#0B1220")
ESCURO2 = colors.HexColor("#111C33")
AZUL = colors.HexColor("#2563EB")
AZUL_CLARO = colors.HexColor("#60A5FA")
TEAL = colors.HexColor("#2DD4BF")
GRAFITE = colors.HexColor("#0F172A")
CINZA = colors.HexColor("#475569")
CINZA_CLARO = colors.HexColor("#94A3B8")
BORDA = colors.HexColor("#E2E8F0")
FUNDO = colors.HexColor("#F8FAFC")
AZUL_F = colors.HexColor("#EFF6FF")
AZUL_B = colors.HexColor("#BFDBFE")
AMBAR_F = colors.HexColor("#FFFBEB")
AMBAR_B = colors.HexColor("#FDE68A")
BRANCO = colors.white

LARGURA_UTIL = 165 * mm

_base = getSampleStyleSheet()


def _st(nome, **kw):
    kw.setdefault("fontName", "Helvetica")
    return ParagraphStyle(nome, parent=_base["Normal"], **kw)


S = {
    "kicker": _st("kicker", fontName="Helvetica-Bold", fontSize=7.5, leading=10,
                  textColor=AZUL, spaceAfter=5),
    "kicker_claro": _st("kicker_claro", fontName="Helvetica-Bold", fontSize=7.5, leading=10,
                        textColor=AZUL_CLARO, spaceAfter=5),
    "h1": _st("h1", fontName="Helvetica-Bold", fontSize=19, leading=23,
              textColor=GRAFITE, spaceAfter=6),
    "h1_capa": _st("h1_capa", fontName="Helvetica-Bold", fontSize=27, leading=31,
                   textColor=BRANCO, spaceAfter=0),
    "h1_capa2": _st("h1_capa2", fontName="Helvetica-Bold", fontSize=27, leading=31,
                    textColor=TEAL, spaceAfter=8),
    "lead": _st("lead", fontSize=10, leading=14.6, textColor=CINZA, spaceAfter=6),
    "lead_escuro": _st("lead_escuro", fontSize=10, leading=15, textColor=colors.HexColor("#CBD5E1")),
    "h2": _st("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=14.5,
              textColor=GRAFITE, spaceBefore=10, spaceAfter=4, keepWithNext=True),
    "h3": _st("h3", fontName="Helvetica-Bold", fontSize=9.6, leading=12.5,
              textColor=GRAFITE, spaceBefore=6, spaceAfter=2, keepWithNext=True),
    "p": _st("p", fontSize=9.4, leading=13.6, textColor=GRAFITE, alignment=TA_JUSTIFY,
             spaceAfter=5),
    "li": _st("li", fontSize=9.4, leading=13.4, textColor=GRAFITE, alignment=TA_JUSTIFY,
              leftIndent=12, bulletIndent=1, spaceAfter=3),
    "nota": _st("nota", fontSize=8.9, leading=12.8, textColor=CINZA, alignment=TA_JUSTIFY),
    "card_t": _st("card_t", fontName="Helvetica-Bold", fontSize=9.8, leading=12.6,
                  textColor=GRAFITE, spaceAfter=3),
    "card_p": _st("card_p", fontSize=8.8, leading=12.2, textColor=CINZA),
    "cel": _st("cel", fontSize=8.6, leading=11.8, textColor=GRAFITE),
    "celb": _st("celb", fontName="Helvetica-Bold", fontSize=8.6, leading=11.8, textColor=GRAFITE),
    "stat_n": _st("stat_n", fontName="Helvetica-Bold", fontSize=19, leading=21, textColor=BRANCO),
    "stat_l": _st("stat_l", fontSize=7.4, leading=9.5, textColor=CINZA_CLARO),
}


# As fontes padrão do PDF não têm emoji: qualquer um vira um quadrado preto na
# página. Como a apresentação original era HTML (onde o emoji funciona), os
# textos ainda os trazem — então eles são removidos aqui, num lugar só.
_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\u231A-\u23FF\u25A0-\u25FF\u2600-\u27BF"
    "\u2B00-\u2BFF\uFE0F\u200D\u20E3]"
)


def limpa(txt: str) -> str:
    return _EMOJI.sub("", txt).replace("  ", " ").strip()


def esp(txt: str) -> str:
    """Texto com espaçamento entre letras, como nos rótulos da apresentação.

    O espaço entre PALAVRAS precisa ser maior que o espaço entre letras, senão
    o rótulo vira um bloco só ("APRESENTAÇÃODOSISTEMA"). Como o Paragraph
    colapsa espaços repetidos, o separador de palavras usa &nbsp;.
    """
    palavras = [" ".join(w) for w in txt.upper().split()]
    return "&nbsp;&nbsp;&nbsp;".join(palavras)


def p(txt, estilo="p"):
    return Paragraph(limpa(txt), S[estilo])


def li(txt, marcador="•"):
    return Paragraph(txt, S["li"], bulletText=marcador)


def regua(cor=AZUL, largura=14 * mm, espessura=2.6):
    t = Table([[""]], colWidths=[largura], rowHeights=[espessura])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), cor),
                           ("LINEBELOW", (0, 0), (-1, -1), 0, colors.white)]))
    return t


def caixa(flows, fundo=FUNDO, borda=BORDA, pad=9, largura=LARGURA_UTIL, barra=None):
    """Bloco destacado. `barra` desenha um filete colorido na lateral esquerda."""
    t = Table([[flows]], colWidths=[largura])
    estilo = [
        ("BACKGROUND", (0, 0), (-1, -1), fundo),
        ("LEFTPADDING", (0, 0), (-1, -1), pad + (3 if barra else 0)),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), pad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]
    if barra:
        estilo.append(("LINEBEFORE", (0, 0), (0, -1), 3, barra))
    else:
        estilo.append(("BOX", (0, 0), (-1, -1), 0.7, borda))
    t.setStyle(TableStyle(estilo))
    return t


def cartao(titulo, texto, largura):
    """Cartão branco com título e texto (as grades de 2 colunas da apresentação)."""
    interno = [p(titulo, "card_t"), p(texto, "card_p")]
    t = Table([[interno]], colWidths=[largura])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRANCO),
        ("BOX", (0, 0), (-1, -1), 0.7, BORDA),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def grade(cartoes, colunas=2, gap=5 * mm):
    """Distribui cartões numa grade, com espaçamento entre eles."""
    largura = (LARGURA_UTIL - gap * (colunas - 1)) / colunas
    linhas, atual = [], []
    for titulo, texto in cartoes:
        atual.append(cartao(titulo, texto, largura))
        if len(atual) == colunas:
            linhas.append(atual)
            atual = []
    if atual:
        while len(atual) < colunas:
            atual.append("")
        linhas.append(atual)
    larguras = [largura] * colunas
    t = Table(linhas, colWidths=larguras, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), gap),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), gap),
    ]))
    return t


def tabela(linhas, larguras):
    dados = [[Paragraph(limpa(c), S["celb"] if i == 0 else S["cel"]) for c in linha]
             for i, linha in enumerate(linhas)]
    t = Table(dados, colWidths=larguras, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF2FF")),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRANCO, FUNDO]),
    ]))
    return t


def secao(kicker, titulo, lead=None):
    """Abertura de página: rótulo espaçado, título grande, linha e chamada."""
    out = [p(esp(kicker), "kicker"), p(titulo, "h1")]
    if lead:
        out.append(p(lead, "lead"))
    out.append(Spacer(1, 3))
    out.append(regua())
    out.append(Spacer(1, 9))
    return out


def marca_rodape(canvas, doc, texto_esq="Fincore360 ERP"):
    canvas.saveState()
    canvas.setStrokeColor(BORDA)
    canvas.setLineWidth(0.6)
    canvas.line(22 * mm, 15 * mm, 187 * mm, 15 * mm)
    canvas.setFont("Helvetica", 7.4)
    canvas.setFillColor(CINZA_CLARO)
    canvas.drawString(22 * mm, 11 * mm, texto_esq)
    canvas.drawRightString(187 * mm, 11 * mm, "%02d" % doc.page)
    canvas.restoreState()


def fundo_capa(canvas, doc):
    """Página de capa: fundo escuro cheio, como na apresentação."""
    canvas.saveState()
    canvas.setFillColor(ESCURO)
    canvas.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    # leve clarão nos cantos, imitando o gradiente do original
    canvas.saveState()
    canvas.setFillAlpha(0.55)
    canvas.setFillColor(ESCURO2)
    canvas.circle(A4[0] * 0.95, A4[1] * 0.93, 120, stroke=0, fill=1)
    canvas.setFillAlpha(0.4)
    canvas.setFillColor(colors.HexColor("#0F2A3A"))
    canvas.circle(A4[0] * 0.04, A4[1] * 0.06, 110, stroke=0, fill=1)
    canvas.restoreState()
    # marca no topo
    canvas.setFillColor(AZUL)
    canvas.roundRect(22 * mm, A4[1] - 33 * mm, 9 * mm, 9 * mm, 2.5 * mm, stroke=0, fill=1)
    canvas.setFillColor(BRANCO)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawCentredString(22 * mm + 4.5 * mm, A4[1] - 30 * mm, "F")
    canvas.setFont("Helvetica-Bold", 10.5)
    canvas.drawString(35 * mm, A4[1] - 30 * mm, "FINCORE360 ERP")
    # rodapé
    canvas.setStrokeColor(colors.HexColor("#1E293B"))
    canvas.setLineWidth(0.6)
    canvas.line(22 * mm, 22 * mm, 187 * mm, 22 * mm)
    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(CINZA_CLARO)
    canvas.drawString(22 * mm, 17 * mm, "Plataforma em nuvem · acesso pelo computador e pelo celular")
    canvas.drawRightString(187 * mm, 17 * mm, "Documento comercial")
    canvas.restoreState()


def stat_escuro(numero, rotulo, largura):
    interno = [Paragraph(numero, S["stat_n"]), Paragraph(rotulo, S["stat_l"])]
    t = Table([[interno]], colWidths=[largura])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#101A2C")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#1E293B")),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def linha_stats(itens, gap=4 * mm):
    largura = (LARGURA_UTIL - gap * (len(itens) - 1)) / len(itens)
    celulas = [stat_escuro(n, r, largura) for n, r in itens]
    t = Table([celulas], colWidths=[largura] * len(itens), hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), gap),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def gerar(caminho, story, titulo_pdf, assunto, rodape="Fincore360 ERP", com_capa=True):
    def pagina_normal(canvas, doc):
        marca_rodape(canvas, doc, rodape)

    doc = BaseDocTemplate(
        caminho, pagesize=A4,
        leftMargin=22 * mm, rightMargin=23 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
        title=titulo_pdf, author="Fincore360 ERP", subject=assunto,
    )
    frame_capa = Frame(22 * mm, 30 * mm, LARGURA_UTIL, A4[1] - 70 * mm, id="capa",
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="corpo",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    templates = []
    if com_capa:
        templates.append(PageTemplate(id="capa", frames=[frame_capa], onPage=fundo_capa))
    templates.append(PageTemplate(id="padrao", frames=[frame], onPage=pagina_normal))
    doc.addPageTemplates(templates)
    doc.build(story)
    print("gerado:", caminho)
