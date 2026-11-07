# -*- coding: utf-8 -*-
"""Texto do manual para o CHAT DE AJUDA do sistema.

Roda o MESMO roteiro do manual em PDF (gera_manual.py), mas com as peças de
diagramação trocadas por coletores de texto, e grava o resultado em
src/lib/ajuda-manual.ts — é a "documentação" que o assistente consulta.
Não precisa do reportlab.

    python3 docs/geradores/gera_manual_texto.py

Rode sempre que o gera_manual.py mudar (o manual e o chat contam a mesma coisa).
"""

import html
import json
import os
import re
import sys
import types

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", ".."))
SAIDA = os.path.join(RAIZ, "src/lib/ajuda-manual.ts")


def texto(t):
    t = re.sub(r"<br\s*/?>", " ", str(t))
    t = re.sub(r"<font[^>]*>.*?</font>", "", t) if "·" not in t else re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"</?b>", "**", t)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\s+", " ", html.unescape(t).replace("\xa0", " ")).strip()


def _nada(*_a, **_k):
    return None


class _Qualquer:
    def __getattr__(self, _n):
        return _nada

    def __call__(self, *_a, **_k):
        return None


def p(txt, estilo="p"):
    return ("p", estilo, txt)


def li(txt, marcador="•"):
    return ("li", txt)


def secao(kicker, titulo, lead=None):
    out = [("p", "h1", titulo)]
    if lead:
        out.append(("p", "lead", lead))
    return out


def grade(cartoes, colunas=2, gap=0):
    return ("grade", cartoes)


def caixa(flows, *a, **k):
    return ("bloco", flows)


def tabela(linhas, larguras=None):
    return ("tabela", linhas)


def linhas_md(item):
    if item is None:
        return []
    if isinstance(item, list):
        return [l for i in item for l in linhas_md(i)]
    tipo = item[0]
    if tipo == "p":
        _, estilo, t = item
        t = texto(t)
        if not t or estilo in ("kicker", "kicker_claro"):
            return []
        if estilo in ("h1", "h1_capa"):
            return ["", f"# {t}"]
        if estilo == "h2":
            return ["", f"## {t}"]
        return [t]
    if tipo == "li":
        return [f"- {texto(item[1])}"]
    if tipo == "grade":
        return [f"- **{texto(a)}** {texto(b)}" for a, b in item[1]]
    if tipo == "bloco":
        return linhas_md(list(item[1]) if isinstance(item[1], (list, tuple)) else [item[1]])
    if tipo == "tabela":
        return [" | ".join(texto(c) for c in linha) for linha in item[1]]
    return []


def gerar(_caminho, story, *_a, **_k):
    linhas = linhas_md(story)
    md = "\n".join(linhas)
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    with open(SAIDA, "w", encoding="utf-8") as f:
        f.write("// GERADO por docs/geradores/gera_manual_texto.py — não editar à mão.\n")
        f.write("// Texto do manual do sistema (o mesmo do PDF), usado pelo chat de ajuda.\n")
        f.write(f"export const MANUAL_DO_SISTEMA = {json.dumps(md, ensure_ascii=False)};\n")
    print(f"ok: {SAIDA} ({len(md)} caracteres)")


# Peças do reportlab e do estilo trocadas por coletores.
rl = types.ModuleType("reportlab")
for nome in ("reportlab.lib", "reportlab.lib.units", "reportlab.platypus", "reportlab.lib.colors"):
    sys.modules[nome] = types.ModuleType(nome)
sys.modules["reportlab"] = rl
sys.modules["reportlab.lib.units"].mm = 1
for n in ("CondPageBreak", "NextPageTemplate", "PageBreak", "Spacer", "Paragraph", "Table", "TableStyle", "KeepTogether"):
    setattr(sys.modules["reportlab.platypus"], n, _nada)
est = types.ModuleType("estilo_fincore")
est.__getattr__ = lambda _n: _Qualquer()
for n, f in dict(p=p, li=li, secao=secao, grade=grade, caixa=caixa, tabela=tabela, gerar=gerar,
                 esp=lambda t: t, linha_stats=_nada).items():
    setattr(est, n, f)
sys.modules["estilo_fincore"] = est

fonte = open(os.path.join(AQUI, "gera_manual.py"), encoding="utf-8").read()
exec(compile(fonte, "gera_manual.py", "exec"), {"__name__": "__main__", "__file__": os.path.join(AQUI, "gera_manual.py")})
