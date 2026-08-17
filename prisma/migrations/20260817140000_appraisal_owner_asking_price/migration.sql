-- Valor pedido pelo proprietário pelo veículo (diferente do preço de avaliação).
ALTER TABLE "vehicle_appraisals" ADD COLUMN IF NOT EXISTS "ownerAskingPrice" DOUBLE PRECISION;
