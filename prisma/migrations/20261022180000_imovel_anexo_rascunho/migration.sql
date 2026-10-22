-- Documento de imóvel em rascunho: o registro lido pela IA no "Novo imóvel"
-- sobe antes de o imóvel existir.
ALTER TABLE "imovel_anexos" ALTER COLUMN "imovelId" DROP NOT NULL;
