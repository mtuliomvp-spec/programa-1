-- Fornecedor do veículo recebido em troca (nome de quem entregou o carro).
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "tiSupplierName" TEXT;
