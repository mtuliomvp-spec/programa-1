-- Devolução do financiamento de terceiros paga a um TERCEIRO autorizado pelas partes.
ALTER TABLE "pre_sales" ADD COLUMN "devolucaoTerceiroNome" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN "devolucaoTerceiroDocumento" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN "devolucaoTerceiroVinculo" TEXT;
ALTER TABLE "sales" ADD COLUMN "devolucaoTerceiroNome" TEXT;
ALTER TABLE "sales" ADD COLUMN "devolucaoTerceiroDocumento" TEXT;
ALTER TABLE "sales" ADD COLUMN "devolucaoTerceiroVinculo" TEXT;
