-- Vínculo opcional de um recebimento com um veículo (ex.: entrada de venda).
ALTER TABLE "receivables" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
