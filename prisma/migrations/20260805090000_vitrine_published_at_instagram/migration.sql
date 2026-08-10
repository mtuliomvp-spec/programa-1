-- Vitrine: data da postagem (selo "Chegou agora") e Instagram da loja no rodapé.
ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "company_settings"
  ADD COLUMN IF NOT EXISTS "instagram" TEXT;

-- Veículos já postados ganham a data de criação como referência (sem selo
-- indevido: são anúncios antigos).
UPDATE "vehicles" SET "publishedAt" = "createdAt" WHERE "published" = true AND "publishedAt" IS NULL;
