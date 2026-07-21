-- Recompra de veículo já vendido: a placa/chassi deixa de ser única no total
-- e passa a ser única apenas entre fichas ATIVAS (status <> VENDIDO).
DROP INDEX "vehicles_plate_key";

DROP INDEX "vehicles_chassi_key";

CREATE UNIQUE INDEX "vehicles_plate_active_key" ON "vehicles"("plate") WHERE "status" <> 'VENDIDO';

CREATE UNIQUE INDEX "vehicles_chassi_active_key" ON "vehicles"("chassi") WHERE "status" <> 'VENDIDO';
