-- Devolução de sinal de venda que não aconteceu.
ALTER TABLE "payables" ADD COLUMN "sinalGroup" TEXT;
ALTER TABLE "payables" ADD COLUMN "sinalParContabil" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "receivables" ADD COLUMN "sinalGroup" TEXT;
ALTER TABLE "receivables" ADD COLUMN "sinalParContabil" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "receivables" ADD COLUMN "sinalVehicleId" TEXT;
