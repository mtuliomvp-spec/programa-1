-- Módulo "Veículos avaliados": avaliação de veículo + fotos. Não toca no
-- estoque nem no financeiro. Idempotente (IF NOT EXISTS).

DO $$ BEGIN
  CREATE TYPE "StatusAvaliacao" AS ENUM ('AVALIADO', 'CONFERIDO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "vehicle_appraisals" (
  "id" TEXT NOT NULL,
  "plate" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "version" TEXT,
  "manufactureYear" INTEGER,
  "modelYear" INTEGER,
  "color" TEXT,
  "fuel" TEXT,
  "transmission" TEXT,
  "km" INTEGER,
  "chassi" TEXT,
  "renavam" TEXT,
  "fipePrice" DOUBLE PRECISION,
  "fipeModelo" TEXT,
  "appraisalPrice" DOUBLE PRECISION,
  "optionals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "checklist" JSONB NOT NULL DEFAULT '{}',
  "notes" TEXT,
  "ownerName" TEXT,
  "ownerPhone" TEXT,
  "status" "StatusAvaliacao" NOT NULL DEFAULT 'AVALIADO',
  "deliveryChecklist" JSONB,
  "deliveryNotes" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "checkedBy" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_appraisals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_appraisals_status_idx" ON "vehicle_appraisals"("status");

CREATE TABLE IF NOT EXISTS "vehicle_appraisal_photos" (
  "id" TEXT NOT NULL,
  "appraisalId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_appraisal_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_appraisal_photos_appraisalId_idx" ON "vehicle_appraisal_photos"("appraisalId");

DO $$ BEGIN
  ALTER TABLE "vehicle_appraisal_photos"
    ADD CONSTRAINT "vehicle_appraisal_photos_appraisalId_fkey"
    FOREIGN KEY ("appraisalId") REFERENCES "vehicle_appraisals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
