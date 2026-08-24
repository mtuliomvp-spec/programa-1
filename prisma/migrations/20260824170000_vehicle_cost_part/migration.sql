-- Peça do almoxarifado aplicada em um veículo do estoque.
ALTER TABLE "vehicle_costs" ADD COLUMN "partId" TEXT;
ALTER TABLE "vehicle_costs" ADD COLUMN "partQuantity" INTEGER;

CREATE INDEX "vehicle_costs_partId_idx" ON "vehicle_costs"("partId");

ALTER TABLE "vehicle_costs"
  ADD CONSTRAINT "vehicle_costs_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
