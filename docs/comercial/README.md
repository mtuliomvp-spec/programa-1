# Documentos comerciais

Relatórios comparativos do Fincore360 (PDF), no mesmo visual do manual
(`docs/geradores/estilo_fincore.py`).

| Arquivo | Para quê |
|---|---|
| `fincore360-vantagens-sobre-integradoras.pdf` | Versão para clientes: Fincore360 × integradoras do Renave, sem citar empresas. |
| `fincore360-vantagens-sobre-trillia.pdf` | Uso interno: compara com a Trillia (ControlStock), com base na negociação de ago–out/2026. |

Para gerar de novo (precisa do `reportlab`):

```bash
python3 docs/comercial/gera_comparativo_integradoras.py
python3 docs/comercial/gera_comparativo_trillia.py
```
