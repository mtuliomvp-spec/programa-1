-- Financiamento de terceiros: quitação do financiamento anterior do veículo
-- (banco credor, valor, código de barras e vencimento do boleto). Informativo:
-- consta no contrato de intermediação e na ficha. O boleto fica anexado ao
-- veículo de terceiro (vehicle_attachments).
ALTER TABLE "pre_sales"
  ADD COLUMN "payoffBank" TEXT,
  ADD COLUMN "payoffAmount" DOUBLE PRECISION,
  ADD COLUMN "payoffBarcode" TEXT,
  ADD COLUMN "payoffDueDate" TIMESTAMP(3);

ALTER TABLE "sales"
  ADD COLUMN "payoffBank" TEXT,
  ADD COLUMN "payoffAmount" DOUBLE PRECISION,
  ADD COLUMN "payoffBarcode" TEXT,
  ADD COLUMN "payoffDueDate" TIMESTAMP(3);
