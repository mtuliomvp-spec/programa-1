-- NF-e emitidas pelo sistema (Focus NFe): uma linha por tentativa.
CREATE TABLE "notas_fiscais" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "saleId" TEXT,
    "tipo" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSANDO',
    "statusSefaz" TEXT,
    "mensagem" TEXT,
    "chave" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "protocolo" TEXT,
    "caminhoXml" TEXT,
    "caminhoDanfe" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "cfop" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "emitidaPor" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "justificativaCancelamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notas_fiscais_ref_key" ON "notas_fiscais"("ref");
CREATE INDEX "notas_fiscais_vehicleId_idx" ON "notas_fiscais"("vehicleId");
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
