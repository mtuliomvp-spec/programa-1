-- Comunicação de venda (SICOVE): valores cobrados pela prestadora e o dia do
-- vencimento do boleto mensal, para o lançamento automático da cobrança.

ALTER TABLE "company_settings" ADD COLUMN "sicoveFornecedor" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "sicoveComunicado" DOUBLE PRECISION;
ALTER TABLE "company_settings" ADD COLUMN "sicoveCancelamento" DOUBLE PRECISION;
ALTER TABLE "company_settings" ADD COLUMN "sicoveVencimentoDia" INTEGER;
