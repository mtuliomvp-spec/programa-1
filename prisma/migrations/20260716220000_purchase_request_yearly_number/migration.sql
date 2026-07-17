-- Numeração por ano das solicitações de compra (0001/2026, reinicia a cada ano)
ALTER TABLE "purchase_requests" ADD COLUMN "year" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchase_requests" ADD COLUMN "seq" INTEGER NOT NULL DEFAULT 0;

-- Backfill: ano pelo createdAt; seq sequencial por ano (ordem de criação).
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM "createdAt")::int AS yr,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM "createdAt")
           ORDER BY "number", "createdAt"
         )::int AS rn
  FROM "purchase_requests"
)
UPDATE "purchase_requests" p
SET "year" = n.yr, "seq" = n.rn
FROM numbered n
WHERE p.id = n.id;

CREATE UNIQUE INDEX "purchase_requests_year_seq_key" ON "purchase_requests"("year", "seq");
