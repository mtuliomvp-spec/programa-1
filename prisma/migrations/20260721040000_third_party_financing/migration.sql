-- Financiamento de terceiros (intermediação): tipo de operação, valores do
-- financiamento/devolução, dados do proprietário do documento e marca do
-- veículo de terceiro (fora do estoque).
CREATE TYPE "TipoOperacao" AS ENUM ('VENDA', 'FINANCIAMENTO_TERCEIROS');

ALTER TABLE "pre_sales"
  ADD COLUMN "saleType" "TipoOperacao" NOT NULL DEFAULT 'VENDA',
  ADD COLUMN "financingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "ownerDocument" TEXT,
  ADD COLUMN "ownerPhone" TEXT,
  ADD COLUMN "ownerAddress" TEXT;

ALTER TABLE "sales"
  ADD COLUMN "saleType" "TipoOperacao" NOT NULL DEFAULT 'VENDA',
  ADD COLUMN "financingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "ownerName" TEXT,
  ADD COLUMN "ownerDocument" TEXT,
  ADD COLUMN "ownerPhone" TEXT,
  ADD COLUMN "ownerAddress" TEXT;

ALTER TABLE "vehicles"
  ADD COLUMN "intermediation" BOOLEAN NOT NULL DEFAULT false;
