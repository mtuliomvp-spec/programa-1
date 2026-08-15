-- Marca manual de "em processo de transferência no DETRAN", para casos antigos
-- em que a taxa foi paga fora do sistema (sem custo de "transferência" para
-- acender o selo automaticamente).
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "transferInProgress" BOOLEAN NOT NULL DEFAULT false;
