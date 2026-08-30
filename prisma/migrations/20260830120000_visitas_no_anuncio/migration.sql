-- Contador de visitas ao anúncio público (vitrine).
CREATE TABLE "showroom_visits" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "appraisalId" TEXT,
    "visitor" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "showroom_visits_vehicleId_viewedAt_idx" ON "showroom_visits"("vehicleId", "viewedAt");
CREATE INDEX "showroom_visits_appraisalId_viewedAt_idx" ON "showroom_visits"("appraisalId", "viewedAt");

ALTER TABLE "showroom_visits" ADD CONSTRAINT "showroom_visits_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showroom_visits" ADD CONSTRAINT "showroom_visits_appraisalId_fkey"
    FOREIGN KEY ("appraisalId") REFERENCES "vehicle_appraisals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
