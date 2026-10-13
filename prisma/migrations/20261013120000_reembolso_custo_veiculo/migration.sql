-- Reembolso de custo do veículo: título a receber que, recebido, reduz o custo
-- do carro (custo negativo ligado ao título).
ALTER TABLE "receivables" ADD COLUMN "costRefundVehicleId" TEXT;
ALTER TABLE "receivables" ADD COLUMN "costRefundCategory" "CategoriaCustoVeiculo";
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_costRefundVehicleId_fkey" FOREIGN KEY ("costRefundVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_costs" ADD COLUMN "receivableId" TEXT;
CREATE UNIQUE INDEX "vehicle_costs_receivableId_key" ON "vehicle_costs"("receivableId");
ALTER TABLE "vehicle_costs" ADD CONSTRAINT "vehicle_costs_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
