-- Quitação de DÉBITOS do veículo (IPVA, multas, licenciamento) com parte do
-- valor financiado, na intermediação: mesma mecânica da quitação do
-- financiamento anterior (informativa, consta no contrato e na ficha).
ALTER TABLE "pre_sales" ADD COLUMN "debtsOrgao" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN "debtsDescricao" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN "debtsAmount" DOUBLE PRECISION;
ALTER TABLE "pre_sales" ADD COLUMN "debtsBarcode" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN "debtsDueDate" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "debtsOrgao" TEXT;
ALTER TABLE "sales" ADD COLUMN "debtsDescricao" TEXT;
ALTER TABLE "sales" ADD COLUMN "debtsAmount" DOUBLE PRECISION;
ALTER TABLE "sales" ADD COLUMN "debtsBarcode" TEXT;
ALTER TABLE "sales" ADD COLUMN "debtsDueDate" TIMESTAMP(3);
