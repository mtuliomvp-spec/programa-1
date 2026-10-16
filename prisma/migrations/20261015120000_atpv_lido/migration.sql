-- O que a leitura da ATPV-e tirou do documento (vendedor, comprador, CRV, valor).
ALTER TABLE "vehicle_attachments" ADD COLUMN "atpvLido" JSONB;
