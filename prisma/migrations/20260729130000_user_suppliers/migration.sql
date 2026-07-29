-- Fornecedor-espelho de cada usuário do sistema
ALTER TABLE "suppliers" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "suppliers_userId_key" ON "suppliers"("userId");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cria um fornecedor-espelho para cada usuário existente
INSERT INTO "suppliers" (
  "id", "name", "userId", "document", "phone", "email",
  "bankName", "bankAgency", "bankAccount", "bankAccountType", "pixKey",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, "name", "id", "document", "phone", "email",
  "bankName", "bankAgency", "bankAccount", "bankAccountType", "pixKey",
  now(), now()
FROM "users";
