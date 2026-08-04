-- Instagram oficial da loja no rodapé da vitrine: preenche se ainda não foi
-- configurado nos Parâmetros (o campo continua editável por lá).
UPDATE "company_settings"
SET "instagram" = 'https://www.instagram.com/mvpveiculos'
WHERE "instagram" IS NULL;
