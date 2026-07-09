# AutoVendas — Gestão de Loja de Veículos Seminovos

Sistema web para lojas de veículos seminovos com **estoque, vendas,
peças e financeiro totalmente integrados**: ao comprar um veículo ou
peça, uma conta a pagar é gerada automaticamente; ao vender, uma ou
mais contas a receber são geradas (à vista, parcelado ou financiado).
O fluxo de caixa é calculado a partir do que foi efetivamente pago e
recebido.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Server Actions) + TypeScript
- [Prisma](https://www.prisma.io) + SQLite (fácil de rodar localmente; troque o `provider`/`DATABASE_URL` para Postgres/MySQL em produção se preferir)
- Tailwind CSS 4
- Zod para validação de formulários

## Módulos

- **Dashboard** — indicadores gerais, fluxo de caixa dos últimos 6 meses e próximos vencimentos.
- **Estoque de veículos** — cadastro, edição, reserva e baixa por venda. Gera conta a pagar na compra.
- **Vendas** — venda de veículo do estoque com pagamento à vista, parcelado (entrada + N parcelas) ou financiado. Gera contas a receber automaticamente e atualiza o status do veículo.
- **Peças** — estoque de peças com reposição (gera conta a pagar) e venda (gera conta a receber), com alerta de estoque mínimo.
- **Financeiro** — Contas a pagar, Contas a receber (com baixa manual e status "atrasado" automático) e Fluxo de caixa consolidado.
- **Clientes e Fornecedores** — cadastros de apoio usados em vendas e compras.

## Rodando localmente

```bash
npm install                 # instala dependências (gera o Prisma Client via postinstall)
npm run db:migrate          # cria o banco SQLite local (prisma/dev.db) e aplica as migrations
npm run db:seed             # popula o banco com dados de demonstração (opcional)
npm run dev                 # inicia o servidor em http://localhost:3000
```

Outros comandos úteis:

```bash
npm run build      # build de produção
npm run start       # roda o build de produção
npm run lint        # lint
npm run db:reset    # reseta o banco (apaga tudo, reaplica migrations e roda o seed)
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
