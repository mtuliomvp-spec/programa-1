-- Sócio ao qual o PÓS-VENDA do veículo está atrelado: enquanto marcado, toda
-- despesa de pós-venda lançada no carro é custeada pelo capital deste sócio
-- (aporte, Banco Neutro), sem tocar no caixa. String pura (sem FK), como o
-- capitalPayerBeneficiaryId da pré-venda.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "postSaleCapitalBeneficiaryId" TEXT;
