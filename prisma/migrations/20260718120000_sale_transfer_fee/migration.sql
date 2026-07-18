-- Transferência (DETRAN) cobrada na venda: indicador + valor. Quando cobrada,
-- vira uma conta a pagar (custo, igual à comissão).
ALTER TABLE "sales" ADD COLUMN "transferCharged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN "transferAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pre_sales" ADD COLUMN "transferCharged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pre_sales" ADD COLUMN "transferAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
