-- Custo do veículo custeado pelo CAPITAL de um sócio: vira retirada do capital
-- dele e não conta como despesa/pós-venda da empresa. String pura, sem FK.
ALTER TABLE "vehicle_costs" ADD COLUMN IF NOT EXISTS "capitalBeneficiaryId" TEXT;
