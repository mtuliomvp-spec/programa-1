-- "Já paguei" parcial: o pré-lançamento cobre só uma parte do título.
ALTER TABLE "payables" ADD COLUMN "pendingPaymentPartial" BOOLEAN NOT NULL DEFAULT false;
-- Parte de um pagamento parcial: aponta para o título que ficou com o saldo.
ALTER TABLE "payables" ADD COLUMN "partialOfId" TEXT;
