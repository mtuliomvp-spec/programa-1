-- Em nome de quem o veículo está: o proprietário lido do último CRLV anexado
-- (preenchido pela leitura por IA do documento; sobrescrito a cada leitura).
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "docOwnerName" TEXT;
