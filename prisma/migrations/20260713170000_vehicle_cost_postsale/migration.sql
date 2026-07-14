-- Custo pós-venda no veículo (lançado após a venda).
ALTER TABLE "vehicle_costs" ADD COLUMN "postSale" BOOLEAN NOT NULL DEFAULT false;
