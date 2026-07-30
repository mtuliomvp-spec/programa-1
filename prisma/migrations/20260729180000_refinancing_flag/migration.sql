-- Refinanciamento no financiamento de terceiros (proprietário refinancia o próprio veículo)
ALTER TABLE "pre_sales" ADD COLUMN "refinancing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN "refinancing" BOOLEAN NOT NULL DEFAULT false;
