-- Detalhamento dos débitos do veículo (IPVA, multas, licenciamento): o total
-- continua em debtsAmount/tiDebts (é ele que abate a entrada), e estas linhas
-- explicam de que ele é feito — cada uma vira um título a pagar próprio.
-- Vazio = comportamento antigo (um título só).
ALTER TABLE "vehicles" ADD COLUMN "debtsItems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "pre_sales" ADD COLUMN "tiDebtsItems" JSONB NOT NULL DEFAULT '[]';
