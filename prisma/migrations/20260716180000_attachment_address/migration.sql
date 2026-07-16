-- Endereço legível (cidade, rua...) resolvido a partir da geolocalização da foto do cliente
ALTER TABLE "vehicle_attachments" ADD COLUMN "address" TEXT;
