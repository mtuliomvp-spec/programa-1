-- Tipo do anexo do título: BOLETO / COMPROVANTE (slots dedicados) ou OUTRO.
ALTER TABLE "payable_attachments" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'OUTRO';
