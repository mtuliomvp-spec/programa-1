-- Vínculo do veículo recebido em troca com a venda.
ALTER TABLE "sales" ADD COLUMN "tradeInVehicleId" TEXT;
CREATE UNIQUE INDEX "sales_tradeInVehicleId_key" ON "sales"("tradeInVehicleId");
ALTER TABLE "sales" ADD CONSTRAINT "sales_tradeInVehicleId_fkey" FOREIGN KEY ("tradeInVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
