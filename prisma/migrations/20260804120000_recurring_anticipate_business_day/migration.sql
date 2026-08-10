-- Recorrências: opção de antecipar o vencimento para o último dia útil quando
-- o dia do mês cai em fim de semana ou feriado nacional (guias de impostos).
ALTER TABLE "recurring_entries"
  ADD COLUMN IF NOT EXISTS "anticipateToBusinessDay" BOOLEAN NOT NULL DEFAULT false;
