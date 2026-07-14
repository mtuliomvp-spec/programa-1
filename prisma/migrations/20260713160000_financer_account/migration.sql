-- Tipo de conta "Financeira" e vínculo da venda com a conta da financeira.
ALTER TYPE "TipoConta" ADD VALUE 'FINANCEIRA';
ALTER TABLE "sales" ADD COLUMN "financerAccountId" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_financerAccountId_fkey" FOREIGN KEY ("financerAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
