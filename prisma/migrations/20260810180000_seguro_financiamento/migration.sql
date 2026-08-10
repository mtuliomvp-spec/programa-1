-- Comissão sobre o seguro vendido junto com o financiamento.
--
-- Diferente do retorno da financeira, esta comissão não tem fórmula nem valor
-- conhecido na hora da venda: fica apenas MARCADA e pendente (nada é lançado)
-- e só é contabilizada quando o dinheiro cai.
--
-- A categoria própria de recebimento é necessária: receita ligada a uma venda
-- só entra na DRE quando a categoria é consultada à parte (ver reports.ts).
-- Com "OUTROS", o caixa subiria sem o lucro subir e o farol ficaria vermelho.
--
-- O valor do enum vem numa transação separada dos usos (exigência do Postgres),
-- por isso o ADD VALUE vem primeiro, como em 20260714120000_devolucao_cliente.

ALTER TYPE "CategoriaReceber" ADD VALUE IF NOT EXISTS 'COMISSAO_SEGURO';

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "insuranceSold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "insuranceAmount" DOUBLE PRECISION;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "insuranceCommissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "insuranceSettledAt" TIMESTAMP(3);

ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "insuranceSold" BOOLEAN NOT NULL DEFAULT false;
