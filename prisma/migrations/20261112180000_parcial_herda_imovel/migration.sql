-- Partes de pagamento parcial criadas sem o imóvel e a competência do título
-- de origem: herdam do título de onde saíram (inclusive parte de parte).
WITH RECURSIVE arvore AS (
  SELECT p.id, p."imovelId", p."referencePeriod"
  FROM "payables" p
  WHERE p."partialOfId" IS NULL
  UNION ALL
  SELECT c.id, COALESCE(c."imovelId", a."imovelId"), COALESCE(c."referencePeriod", a."referencePeriod")
  FROM "payables" c
  JOIN arvore a ON c."partialOfId" = a.id
)
UPDATE "payables" t
SET "imovelId" = a."imovelId", "referencePeriod" = a."referencePeriod"
FROM arvore a
WHERE t.id = a.id
  AND t."partialOfId" IS NOT NULL
  AND (t."imovelId" IS DISTINCT FROM a."imovelId" OR t."referencePeriod" IS DISTINCT FROM a."referencePeriod")
  AND (t."imovelId" IS NULL OR t."referencePeriod" IS NULL);
