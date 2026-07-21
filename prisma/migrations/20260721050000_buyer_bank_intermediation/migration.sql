-- Dados bancários do comprador (financiamento de terceiros): usados no contrato
-- para a transferência da devolução assim que a financeira pagar a loja.
ALTER TABLE "pre_sales"
  ADD COLUMN "buyerBankName" TEXT,
  ADD COLUMN "buyerBankAgency" TEXT,
  ADD COLUMN "buyerBankAccount" TEXT,
  ADD COLUMN "buyerBankAccountType" TEXT,
  ADD COLUMN "buyerPixKey" TEXT;

ALTER TABLE "sales"
  ADD COLUMN "buyerBankName" TEXT,
  ADD COLUMN "buyerBankAgency" TEXT,
  ADD COLUMN "buyerBankAccount" TEXT,
  ADD COLUMN "buyerBankAccountType" TEXT,
  ADD COLUMN "buyerPixKey" TEXT;
