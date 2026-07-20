-- Veículo "postado" na vitrine pública (opt-in manual).
ALTER TABLE "vehicles" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
