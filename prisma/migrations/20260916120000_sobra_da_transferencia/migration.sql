-- Sobra da transferência (DETRAN) de venda em mês já encerrado: o título a
-- pagar encolhe pelo orçamento do despachante, mas o resultado do mês fechado
-- fica intacto — o ganho é reconhecido no período aberto, na data gravada aqui.
ALTER TABLE "sales" ADD COLUMN "transferSobraAmount" DOUBLE PRECISION;
ALTER TABLE "sales" ADD COLUMN "transferSobraAt" TIMESTAMP(3);
