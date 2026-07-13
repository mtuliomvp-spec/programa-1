-- Banco/financeira e valor financiado na venda financiada.
ALTER TABLE "sales" ADD COLUMN "financerName" TEXT;
ALTER TABLE "sales" ADD COLUMN "financedAmount" DOUBLE PRECISION;
