-- Vitrine: avaliação publicada como REPASSE (carro fora do estoque).
ALTER TABLE "vehicle_appraisals" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicle_appraisals" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "vehicle_appraisals" ADD COLUMN "repassePrice" DOUBLE PRECISION;
