-- Foto do cliente (antifraude) com geolocalização, guardada na mesma tabela de anexos
CREATE TYPE "AttachmentKind" AS ENUM ('DOCUMENTO', 'FOTO_CLIENTE');

ALTER TABLE "vehicle_attachments"
    ADD COLUMN "kind" "AttachmentKind" NOT NULL DEFAULT 'DOCUMENTO',
    ADD COLUMN "latitude" DOUBLE PRECISION,
    ADD COLUMN "longitude" DOUBLE PRECISION,
    ADD COLUMN "geoAccuracy" DOUBLE PRECISION;
