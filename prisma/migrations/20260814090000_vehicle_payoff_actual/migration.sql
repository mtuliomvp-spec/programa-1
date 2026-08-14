-- Quitação REAL (boleto do banco) quando diferente do acordado (payoffAmount):
-- o título de quitação sai pelo valor real e a diferença vira custo de ajuste
-- do veículo (acréscimo → custo; menor → reduz o custo). O líquido ao vendedor
-- segue calculado pelo acordado. Nulo = boleto igual ao acordado.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "payoffActualAmount" DOUBLE PRECISION;
