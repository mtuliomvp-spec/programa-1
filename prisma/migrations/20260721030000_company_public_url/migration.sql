-- Domínio oficial do site, configurável nos Parâmetros (links públicos/QR Codes).
ALTER TABLE "company_settings" ADD COLUMN "publicUrl" TEXT;
