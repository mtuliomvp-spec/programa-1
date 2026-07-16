-- % de imposto retido pela financeira sobre o retorno
ALTER TABLE "financial_accounts" ADD COLUMN "returnTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
