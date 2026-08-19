-- Ocorrências excluídas de uma recorrência (chave AAAA-MM-DD do vencimento):
-- a geração pula esses dias para o título excluído não ser recriado.
ALTER TABLE "recurring_entries" ADD COLUMN IF NOT EXISTS "skippedDays" TEXT[] DEFAULT ARRAY[]::TEXT[];
