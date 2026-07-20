-- Nº do documento de origem (nota fiscal, fatura, boleto) na conta a pagar.
ALTER TABLE "payables" ADD COLUMN "documentNumber" TEXT;
