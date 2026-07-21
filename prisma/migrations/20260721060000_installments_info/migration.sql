-- Parcelamento informado ao comprador (só informativo, consta no contrato).
ALTER TABLE "pre_sales"
  ADD COLUMN "installmentsInfoCount" INTEGER,
  ADD COLUMN "installmentsInfoAmount" DOUBLE PRECISION;

ALTER TABLE "sales"
  ADD COLUMN "installmentsInfoCount" INTEGER,
  ADD COLUMN "installmentsInfoAmount" DOUBLE PRECISION;
