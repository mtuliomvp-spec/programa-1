-- Fatura de cartão de crédito: título com lançamentos detalhados por fluxo.

ALTER TABLE "payables" ADD COLUMN IF NOT EXISTS "cardInvoice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recurring_entries" ADD COLUMN IF NOT EXISTS "cardInvoice" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "card_invoice_items" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "structuralKey" TEXT NOT NULL DEFAULT 'ADMINISTRATIVO',
    "vehicleId" TEXT,
    "capitalBeneficiaryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "card_invoice_items_payableId_idx" ON "card_invoice_items"("payableId");

ALTER TABLE "card_invoice_items"
  ADD CONSTRAINT "card_invoice_items_payableId_fkey"
  FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_invoice_items"
  ADD CONSTRAINT "card_invoice_items_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "card_invoice_items"
  ADD CONSTRAINT "card_invoice_items_capitalBeneficiaryId_fkey"
  FOREIGN KEY ("capitalBeneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custo do veículo vindo de um item da fatura (1:1, some junto com o item).
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "cardItemId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_costs_cardItemId_key" ON "vehicle_costs"("cardItemId");
ALTER TABLE "vehicle_costs"
  ADD CONSTRAINT "vehicle_costs_cardItemId_fkey"
  FOREIGN KEY ("cardItemId") REFERENCES "card_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retirada de capital vinda de um item da fatura (1:1, some junto com o item).
ALTER TABLE "capital_transactions" ADD COLUMN IF NOT EXISTS "cardItemId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "capital_transactions_cardItemId_key" ON "capital_transactions"("cardItemId");
ALTER TABLE "capital_transactions"
  ADD CONSTRAINT "capital_transactions_cardItemId_fkey"
  FOREIGN KEY ("cardItemId") REFERENCES "card_invoice_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
