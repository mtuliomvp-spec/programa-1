# Geradores dos PDFs da plataforma

Scripts que produzem os dois documentos publicados em `public/documentos/` e
oferecidos na tela **Sistema › Assinatura**:

| Script | Gera |
| --- | --- |
| `gera_apresentacao.py` | `public/documentos/fincore360-apresentacao.pdf` — apresentação comercial |
| `gera_manual.py` | `public/documentos/fincore360-manual-do-sistema.pdf` — manual de uso, tela por tela |

`estilo_fincore.py` guarda a identidade visual comum (paleta, capa escura,
cartões, tabelas e rodapé) — é dela que sai o mesmo visual nos dois arquivos.
`qr-whats.png` é o QR do WhatsApp comercial usado na última página da
apresentação.

## Como regerar

```bash
pip install reportlab                 # única dependência
python3 docs/geradores/gera_apresentacao.py
python3 docs/geradores/gera_manual.py
```

Os caminhos de saída estão no topo de cada script. Depois de regerar, confira o
PDF e faça o commit do arquivo junto — é a versão que a tela de Assinatura
entrega.

> As fontes padrão do PDF não têm emoji: `estilo_fincore.limpa()` remove
> qualquer um antes de compor a página, senão viram quadrados pretos.
