-- Detalhes do veículo da troca na pré-venda (para o preenchimento por placa).
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "tiVersion" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "tiFuel" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "tiTransmission" TEXT;
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "tiChassi" TEXT;
