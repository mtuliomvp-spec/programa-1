-- Financeira/banco indicado pelo cliente, NÃO conveniado à loja (sem conta
-- financeira): guarda o nome na pré-venda para levar ao contrato e à venda.
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "financerName" TEXT;
