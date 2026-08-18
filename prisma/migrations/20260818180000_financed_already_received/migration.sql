-- Financiamento já recebido (está no sinal/entradas): não gera repasse a
-- receber do banco nem devolução ao cliente. Idempotente.
ALTER TABLE "pre_sales" ADD COLUMN IF NOT EXISTS "financedAlreadyReceived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "financedAlreadyReceived" BOOLEAN NOT NULL DEFAULT false;
