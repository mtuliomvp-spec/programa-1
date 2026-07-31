-- Rótulo de exibição da categoria na solicitação de compra (categoria gerenciável).
ALTER TABLE "purchase_requests" ADD COLUMN "categoryLabel" TEXT;

-- Backfill do rótulo a partir do enum, para as solicitações existentes.
UPDATE "purchase_requests" SET "categoryLabel" = CASE "category"
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
