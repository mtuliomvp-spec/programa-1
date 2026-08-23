-- Contas estruturais do sistema (Banco Neutro): chave fixa + proteção.
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "structural" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "financial_accounts_key_key" ON "financial_accounts"("key");

-- Adota o "Banco Neutro" que já existe (a conta mais antiga, se houver
-- repetidas) em vez de criar outra. Idempotente: só roda se ainda não houver
-- nenhuma conta com a chave.
UPDATE "financial_accounts"
SET "key" = 'NEUTRO', "structural" = true, "active" = true, "isDefault" = false
WHERE "id" = (
  SELECT "id" FROM "financial_accounts"
  WHERE "name" = 'Banco Neutro'
  ORDER BY "createdAt" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "financial_accounts" WHERE "key" = 'NEUTRO');
