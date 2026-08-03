-- Veículos consignados: o carro é de um terceiro (o consignante = supplier),
-- mas fica no estoque/vitrine e é vendido normalmente. purchasePrice fica 0
-- (não é patrimônio comprado) e a loja deve ao dono `ownerRefundAmount` quando
-- o carro é vendido. No fechamento da venda esse valor vira uma conta
-- DEVOLUCAO_PROPRIETARIO (pago ao dono) OU um aporte no capital de um
-- beneficiário (o dinheiro fica na empresa).

ALTER TABLE "vehicles"
  ADD COLUMN "consigned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ownerRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "sales"
  ADD COLUMN "consigned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ownerRefundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "ownerRefundToCapital" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ownerRefundBeneficiaryId" TEXT;

ALTER TABLE "pre_sales"
  ADD COLUMN "ownerRefundToCapital" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ownerRefundBeneficiaryId" TEXT;

ALTER TABLE "capital_transactions"
  ADD COLUMN "saleId" TEXT;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_ownerRefundBeneficiaryId_fkey"
  FOREIGN KEY ("ownerRefundBeneficiaryId")
  REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "capital_transactions"
  ADD CONSTRAINT "capital_transactions_saleId_fkey"
  FOREIGN KEY ("saleId")
  REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
