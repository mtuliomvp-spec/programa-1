-- Slogan da loja (vitrine): antes fixo no código ("Fazendo mais por você!", da
-- MVP). A instalação da MVP continua com ele; as demais começam sem slogan.
ALTER TABLE "company_settings" ADD COLUMN "slogan" TEXT;
UPDATE "company_settings" SET "slogan" = 'Fazendo mais por você!' WHERE "nomeFantasia" ILIKE 'MVP%';

-- Instalação nova não nasce com o nome da MVP.
ALTER TABLE "company_settings" ALTER COLUMN "razaoSocial" SET DEFAULT 'Sua Revenda';
ALTER TABLE "company_settings" ALTER COLUMN "nomeFantasia" SET DEFAULT 'Sua Revenda';
