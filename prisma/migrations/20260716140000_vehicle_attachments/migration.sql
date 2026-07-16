-- Documentos anexados ao veículo (ex.: Comunicação de venda)
CREATE TABLE "vehicle_attachments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehicle_attachments_vehicleId_idx" ON "vehicle_attachments"("vehicleId");
ALTER TABLE "vehicle_attachments" ADD CONSTRAINT "vehicle_attachments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
