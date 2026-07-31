-- Categorias de lançamento gerenciáveis (despesa e receita) + rótulo de exibição.

-- 1) Novo enum de tipo da categoria.
CREATE TYPE "CategoriaKind" AS ENUM ('DESPESA', 'RECEITA');

-- 2) Estende launch_categories: tipo, protegida (system) e enum mapeado (code).
DROP INDEX "launch_categories_name_key";
ALTER TABLE "launch_categories" ADD COLUMN "kind" "CategoriaKind" NOT NULL DEFAULT 'DESPESA';
ALTER TABLE "launch_categories" ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "launch_categories" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "launch_categories_name_kind_key" ON "launch_categories"("name", "kind");

-- 3) Rótulo de exibição da categoria em receber e recorrência.
ALTER TABLE "receivables" ADD COLUMN "categoryLabel" TEXT;
ALTER TABLE "recurring_entries" ADD COLUMN "categoryLabel" TEXT;

-- 4) Seed idempotente das categorias de sistema (padrão). id = hash aleatório
--    (sem depender de extensão); createdAt usa o default da coluna.
INSERT INTO "launch_categories" ("id", "name", "kind", "system", "code") VALUES
  (md5(random()::text || clock_timestamp()::text), 'Despesa operacional', 'DESPESA', true, 'DESPESA_OPERACIONAL'),
  (md5(random()::text || clock_timestamp()::text), 'Comissão', 'DESPESA', true, 'COMISSAO'),
  (md5(random()::text || clock_timestamp()::text), 'Salário', 'DESPESA', true, 'SALARIO'),
  (md5(random()::text || clock_timestamp()::text), 'Combustível', 'DESPESA', true, 'COMBUSTIVEL'),
  (md5(random()::text || clock_timestamp()::text), 'Outros', 'DESPESA', true, 'OUTROS'),
  (md5(random()::text || clock_timestamp()::text), 'Tráfego pago', 'DESPESA', false, NULL),
  (md5(random()::text || clock_timestamp()::text), 'Venda de veículo', 'RECEITA', true, 'VENDA_VEICULO'),
  (md5(random()::text || clock_timestamp()::text), 'Venda de peças', 'RECEITA', true, 'VENDA_PECA'),
  (md5(random()::text || clock_timestamp()::text), 'Retorno de financiamento', 'RECEITA', true, 'RETORNO_FINANCEIRA'),
  (md5(random()::text || clock_timestamp()::text), 'Outros', 'RECEITA', true, 'OUTROS')
ON CONFLICT ("name", "kind") DO UPDATE SET "system" = EXCLUDED."system", "code" = EXCLUDED."code";

-- 5) Backfill do rótulo nos títulos a pagar antigos (para renomear "atualizar
--    tudo" e exibir consistente). Só onde ainda está nulo.
UPDATE "payables" SET "categoryLabel" = CASE "category"
    WHEN 'COMPRA_VEICULO' THEN 'Compra de veículo'
    WHEN 'COMPRA_PECA' THEN 'Compra de peças'
    WHEN 'DESPESA_OPERACIONAL' THEN 'Despesa operacional'
    WHEN 'COMISSAO' THEN 'Comissão'
    WHEN 'SALARIO' THEN 'Salário'
    WHEN 'COMBUSTIVEL' THEN 'Combustível'
    WHEN 'DEVOLUCAO_CLIENTE' THEN 'Devolução ao cliente'
    WHEN 'OUTROS' THEN 'Outros'
  END
WHERE "categoryLabel" IS NULL;
