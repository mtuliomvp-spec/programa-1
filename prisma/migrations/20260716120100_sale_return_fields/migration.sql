-- Retorno da financeira na venda e na pré-venda
ALTER TABLE "sales" ADD COLUMN "returnLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "returnNet" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "returnSettledAt" TIMESTAMP(3);
ALTER TABLE "pre_sales" ADD COLUMN "returnLevel" INTEGER NOT NULL DEFAULT 0;
