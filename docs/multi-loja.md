# Multi-loja (Fincore360)

Uma publicação na Vercel atende várias lojas. **Cada loja tem o próprio banco**
(dados isolados, backup e restauração por loja); a publicação escolhe o banco
pelo endereço acessado.

```
mvpveiculos.com.br ─┐                    ┌─► banco da MVP
loja2.fincore360…  ─┼─► mesma publicação ─┼─► banco da Loja 2
loja3.fincore360…  ─┘   (catálogo diz     └─► banco da Loja 3
                         qual banco usar)
```

## Como liga

Sem `CATALOGO_DATABASE_URL` o sistema é de **uma loja só** — exatamente como
sempre foi (o `prisma` é o cliente direto do `DATABASE_URL`). Com a variável,
entra o modo multi-loja.

| Variável | Para quê |
|---|---|
| `CATALOGO_DATABASE_URL` | Banco do catálogo (uma linha por loja). Pequeno e separado. |
| `CATALOGO_CHAVE` | Cifra (AES-256-GCM) das URLs dos bancos e dos segredos das lojas. Mín. 32 caracteres. Sem ela o catálogo não abre. |
| `DOMINIO_PLATAFORMA` | `loja.<domínio>` → loja de slug `loja`. `www`, `app`, `admin`, `api`… são reservados. |
| `LOJA_PADRAO` | Opcional: slug usado em endereços fora da plataforma que não estão no catálogo (ex.: `*.vercel.app`). |

## Peças

- `src/lib/catalogo.ts` — tabela `lojas` no banco do catálogo (criada sozinha):
  slug, nome, domínios próprios, banco (cifrado), segredos (cifrados),
  `usa_ambiente`, status `ATIVA`/`SUSPENSA`.
- `src/lib/tenant.ts` — `lojaAtual()`: a loja da requisição pelo endereço (com
  memória de 60 s). `comLoja(loja, fn)` escolhe a loja à mão (rotinas da
  plataforma). `variavelDaLoja(nome)`: segredo da loja.
- `src/lib/prisma.ts` — no multi-loja o `prisma` de todo o sistema é um
  intermediário que, a cada consulta, usa o cliente do banco da loja (um
  cliente por banco, reaproveitado). `$transaction` em lista e interativo
  funcionam igual.
- Sessão (`src/lib/auth.ts` e `src/proxy.ts`): o cookie leva a loja e o
  endereço em que o login foi feito. Cookie de outra loja é recusado no
  porteiro e no servidor. Na virada para o multi-loja cada usuário entra de
  novo uma vez.
- Endereço sem loja → aviso "Nenhuma loja neste endereço"; loja `SUSPENSA` →
  "Loja desativada" (o bloqueio por falta de pagamento continua sendo o de
  cada loja, em Sistema › Assinatura).

## Segredos por loja

Certificado do Renave (`RENAVE_CERT_*`), tokens da Focus (`FOCUS_NFE_TOKEN_*`),
token da consulta por placa (`PLACA_API_TOKEN`) e `APP_URL` são **da loja**:

- loja com `usa_ambiente` (a MVP, que veio da instalação de uma loja só): vêm
  das variáveis do projeto na Vercel, como hoje;
- demais lojas: dos segredos dela no catálogo — **nunca** das variáveis do
  projeto (que são da MVP).

Serviços pagos pela Fincore (IA, e-mail Brevo, FIPE, CEP, CNPJ) continuam nas
variáveis do projeto, iguais para todas.

## Migrações

`scripts/vercel-build.mjs` aplica as migrações no banco do projeto e depois em
**todo banco de loja do catálogo**. Se uma loja falhar, o build para — publicar
com um banco atrasado quebraria aquela loja.

## Painel da plataforma (criar e administrar lojas)

Endereço: `https://admin.<DOMINIO_PLATAFORMA>/plataforma` (em qualquer outro
endereço a rota não existe). Entrada pela senha da plataforma.

| Variável | Para quê |
|---|---|
| `PLATAFORMA_SENHA` | Senha do painel (na falta, vale a `SUPER_ADMIN_PASSWORD`). |
| `PLATAFORMA_BANCO_URL` | Servidor onde nascem os bancos das lojas novas (URL com pooler). No Neon: a URL do projeto. |
| `PLATAFORMA_BANCO_URL_DIRETA` | A mesma, sem pooler (cria o banco e roda as migrações). |
| `VERCEL_DEPLOY_HOOK_URL` | Deploy Hook da Vercel: a criação da loja pede a publicação sozinha. |

**Criar loja:** nome, subdomínio, razão social/CNPJ, domínios próprios
(opcional) e o administrador (nome, e-mail, senha inicial).

1. O painel cria o banco `loja_<subdominio>` no servidor da plataforma (ou
   usa a URL de um banco já criado, se o servidor não estiver configurado).
2. Grava a loja no catálogo como **Em preparo** (o administrador vai cifrado,
   só com o hash da senha).
3. Pede uma publicação (Deploy Hook). O build aplica as migrações no banco
   novo, cria o administrador e os dados da empresa e libera a loja.
   Enquanto isso, o endereço da loja mostra "Sua loja está sendo preparada".

**Ficha da loja:** nome, domínios próprios, situação (Ativa/Suspensa) e os
segredos da loja — certificado do Renave (.pfx), senhas, tokens da Focus e da
consulta por placa, APP_URL. Os segredos ficam cifrados no catálogo e nunca
são mostrados de volta (só "✓ configurado"). Mudanças valem em até 1 minuto
(memória do endereço).

Domínio próprio de uma loja: cadastrar na ficha **e** adicionar no projeto da
Vercel (Settings › Domains), com o DNS da loja apontando para a Vercel.

## Linha de comando

```bash
LOJA_DATABASE_URL="..." \
  node scripts/loja.mjs salvar mvp "MVP Veículos" mvpveiculos.com.br,www.mvpveiculos.com.br --usa-ambiente
node scripts/loja.mjs listar
```

(A URL do banco vai por variável, nunca como argumento.)

## Próxima fase

**Fase 3:** domínio do Fincore360 com subdomínio curinga na Vercel e a virada
da MVP (catálogo em produção com `mvpveiculos.com.br` → banco atual, marcada
`--usa-ambiente`).
