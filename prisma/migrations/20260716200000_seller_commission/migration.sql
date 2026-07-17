-- Comissão do vendedor na venda de veículo
ALTER TABLE "sales" ADD COLUMN "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pre_sales" ADD COLUMN "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Vínculo do título com a venda de origem (ex.: comissão)
ALTER TABLE "payables" ADD COLUMN "saleId" TEXT;
ALTER TABLE "payables" ADD CONSTRAINT "payables_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "payables_saleId_idx" ON "payables"("saleId");
