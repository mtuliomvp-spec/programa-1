-- Custo unitário da peça no momento da venda.
ALTER TABLE "part_sales" ADD COLUMN "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Vendas antigas: adota o custo atual cadastrado na peça (é o que os relatórios
-- usavam até aqui, então o histórico não muda de valor com esta migração).
UPDATE "part_sales" ps
SET "unitCost" = p."costPrice"
FROM "parts" p
WHERE p."id" = ps."partId";
