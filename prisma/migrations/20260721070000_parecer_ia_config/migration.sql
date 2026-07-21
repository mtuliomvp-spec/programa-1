-- Parecer IA: configuração da IA (provedor, chave de API e modelo) nos Parâmetros.
ALTER TABLE "company_settings"
  ADD COLUMN "aiProvider" TEXT,
  ADD COLUMN "aiApiKey" TEXT,
  ADD COLUMN "aiModel" TEXT;
