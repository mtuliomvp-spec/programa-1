-- Destino específico da solicitação de compra: veículo (fluxo Veículos) ou
-- beneficiário do capital (fluxo Capital). Levados até a conta a pagar.
ALTER TABLE "purchase_requests" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "purchase_requests" ADD COLUMN "capitalBeneficiaryId" TEXT;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_capitalBeneficiaryId_fkey"
  FOREIGN KEY ("capitalBeneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
