-- Centros de custo estruturais (Capital, Veículos, Administrativo) e
-- beneficiário-empresa no capital.
ALTER TYPE "TipoCentroCusto" ADD VALUE IF NOT EXISTS 'ESTRUTURAL';

ALTER TABLE "cost_centers" ADD COLUMN "key" TEXT;
ALTER TABLE "cost_centers" ADD COLUMN "structural" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "cost_centers_key_key" ON "cost_centers"("key");

ALTER TABLE "capital_beneficiaries" ADD COLUMN "isCompany" BOOLEAN NOT NULL DEFAULT false;
