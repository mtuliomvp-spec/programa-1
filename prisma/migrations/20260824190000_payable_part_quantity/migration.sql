-- Quantidade de peças em cada compra (para o histórico de valor unitário).
ALTER TABLE "payables" ADD COLUMN "partQuantity" INTEGER;

-- Compras antigas: a quantidade já estava escrita na descrição ("(12 un.)").
UPDATE "payables"
SET "partQuantity" = NULLIF(substring("description" from '\((\d+) un\.\)'), '')::int
WHERE "partId" IS NOT NULL
  AND "description" ~ '\(\d+ un\.\)';
