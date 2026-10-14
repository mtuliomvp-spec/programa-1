-- Configuração da emissão de NF-e (provedor, ambiente e regra fiscal do contador).
ALTER TABLE "company_settings" ADD COLUMN "nfeConfig" JSONB NOT NULL DEFAULT '{}';
