-- Dados bancários do usuário (beneficiário na Ordem de Pagamento)
ALTER TABLE "users"
    ADD COLUMN "document" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "bankName" TEXT,
    ADD COLUMN "bankAgency" TEXT,
    ADD COLUMN "bankAccount" TEXT,
    ADD COLUMN "bankAccountType" TEXT,
    ADD COLUMN "pixKey" TEXT;

-- Vendedor (usuário) da venda / pré-venda
ALTER TABLE "sales" ADD COLUMN "sellerId" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sales_sellerId_idx" ON "sales"("sellerId");

ALTER TABLE "pre_sales" ADD COLUMN "sellerId" TEXT;
ALTER TABLE "pre_sales" ADD CONSTRAINT "pre_sales_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "pre_sales_sellerId_idx" ON "pre_sales"("sellerId");

-- Beneficiário usuário do título (comissão)
ALTER TABLE "payables" ADD COLUMN "beneficiaryUserId" TEXT;
ALTER TABLE "payables" ADD CONSTRAINT "payables_beneficiaryUserId_fkey"
    FOREIGN KEY ("beneficiaryUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "payables_beneficiaryUserId_idx" ON "payables"("beneficiaryUserId");
