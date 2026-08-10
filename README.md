# MVP Veículos — Sistema de Gestão

Sistema web para lojas de veículos seminovos com **estoque, vendas,
peças e financeiro totalmente integrados**: ao comprar um veículo ou
peça, uma conta a pagar é gerada automaticamente; ao vender, uma ou
mais contas a receber são geradas (à vista, parcelado ou financiado).
O fluxo de caixa é calculado a partir do que foi efetivamente pago e
recebido.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Server Actions) + TypeScript
- [Prisma](https://www.prisma.io) + PostgreSQL (Neon, Supabase ou qualquer Postgres)
- Tailwind CSS 4
- Zod para validação de formulários

## Módulos

- **Dashboard** — indicadores gerais, fluxo de caixa dos últimos 6 meses e próximos vencimentos.
- **Estoque de veículos** — cadastro, edição, reserva e baixa por venda. Gera conta a pagar na compra.
- **Vendas** — venda de veículo do estoque com pagamento à vista, parcelado (entrada + N parcelas) ou financiado. Gera contas a receber automaticamente e atualiza o status do veículo.
- **Peças** — estoque de peças com reposição (gera conta a pagar) e venda (gera conta a receber), com alerta de estoque mínimo.
- **Financeiro** — Contas a pagar, Contas a receber (com baixa manual e status "atrasado" automático) e Fluxo de caixa consolidado.
- **Clientes e Fornecedores** — cadastros de apoio usados em vendas e compras.

## Deploy na Vercel (recomendado)

1. Acesse [vercel.com](https://vercel.com) e entre com sua conta do GitHub.
2. **Add New → Project** e importe o repositório `programa-1`.
3. Antes (ou depois) do primeiro deploy, na aba **Storage** do projeto,
   clique em **Create Database → Neon (Postgres)** e aceite os padrões.
   Isso cria o banco gratuito e já configura as variáveis
   `DATABASE_URL` e `DATABASE_URL_UNPOOLED` automaticamente.
4. Faça o **Deploy** (ou **Redeploy** se o banco foi criado depois).
   O build roda `prisma migrate deploy` e cria as tabelas sozinho.

Pronto: o site fica disponível em `https://<seu-projeto>.vercel.app`.

### Região: o servidor tem de ficar ao lado do banco

O `vercel.json` fixa as funções em **`gru1` (São Paulo)** porque é onde fica o
banco Neon (`sa-east-1`). Isso não é detalhe de configuração — é o item de maior
impacto no desempenho do sistema.

Com o servidor em `iad1` (Washington, padrão da Vercel) e o banco em São Paulo,
cada consulta media **113 ms** só de viagem. Como o farol contábil faz ~41
consultas antes de qualquer gravação, pagar um título levava mais de 5 segundos
— e uma fatura de cartão com 40 itens, quase meio minuto. Na mesma região isso
cai para 1-5 ms por consulta.

Ao criar o banco em outra região, mude `regions` no `vercel.json` para
acompanhá-lo. A tela **Sistema › Desempenho** (administradores) compara as duas
regiões e mede a latência real com o botão "Medir agora".

Para popular o banco de produção com dados de demonstração (opcional),
rode localmente apontando para o banco da Vercel:

```bash
DATABASE_URL="<url do Neon>" npm run db:seed
```

## Consulta por placa (preenchimento automático)

No cadastro de veículo, o botão **"Buscar dados pela placa"** preenche
marca, modelo, versão, anos, cor, chassi e combustível, e sugere o
**valor FIPE** como preço de venda.

Para ativar, é preciso contratar um token de um provedor de consulta
veicular (ex.: [wdapi2.com.br](https://wdapi2.com.br) — planos a partir
de alguns centavos por consulta) e configurar na Vercel:

1. No projeto da Vercel: **Settings → Environment Variables**
2. Adicione `PLACA_API_TOKEN` com o token contratado
3. (Opcional) `PLACA_API_URL` para outro provedor, usando os marcadores
   `{placa}` e `{token}` — padrão: `https://wdapi2.com.br/consulta/{placa}/{token}`
4. Faça **Redeploy**

Sem o token, o botão exibe uma mensagem explicando como ativar — o
restante do sistema funciona normalmente.

## Rodando localmente

Crie um arquivo `.env` a partir do `.env.example` com a URL de um
Postgres (pode ser o mesmo banco Neon criado na Vercel) e:

```bash
npm install                 # instala dependências (gera o Prisma Client via postinstall)
npm run db:migrate          # aplica as migrations no banco
npm run db:seed             # popula o banco com dados de demonstração (opcional)
npm run dev                 # inicia o servidor em http://localhost:3000
```

Outros comandos úteis:

```bash
npm run build        # build de produção (aplica migrations + next build)
npm run build:local  # build sem aplicar migrations
npm run start        # roda o build de produção
npm run lint         # lint
npm run db:reset     # reseta o banco (apaga tudo, reaplica migrations e roda o seed)
```

## Estrutura

```
prisma/schema.prisma   modelos (veículos, peças, clientes, fornecedores, vendas, contas)
prisma/seed.ts          dados de demonstração
src/lib/finance.ts      regras de negócio: integra estoque/vendas/peças ao financeiro
src/lib/queries.ts       consultas agregadas do dashboard e fluxo de caixa
src/app/**               páginas e Server Actions de cada módulo
src/components/          componentes de UI reutilizáveis
```

## Sugestões de evolução

- Autenticação/usuários (hoje o sistema é single-tenant, sem login).
- Upload de fotos dos veículos.
- Emissão de recibo/contrato de venda em PDF.
- Integração com API de FIPE para sugestão de preço.
- Relatórios (comissão por vendedor, giro de estoque, DRE simplificado).
