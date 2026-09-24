-- Repasse e retorno da financeira informados à frente do movimento do caixa.
ALTER TABLE "sales" ADD COLUMN "pendingFinancingDate" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "pendingFinancingAccountId" TEXT;
ALTER TABLE "sales" ADD COLUMN "pendingReturnDate" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "pendingReturnAmount" DOUBLE PRECISION;
ALTER TABLE "sales" ADD COLUMN "pendingReturnAccountId" TEXT;
