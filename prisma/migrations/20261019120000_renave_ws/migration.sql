-- Integração direta com o Renave-WS (SERPRO)
ALTER TABLE "vehicles" ADD COLUMN "crvTipo" TEXT;

ALTER TABLE "company_settings" ADD COLUMN "renaveWsAmbiente" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "renaveWsEmail" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "renaveWsCpfOperador" TEXT;

CREATE TABLE "renave_registros" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "mock" JSONB,
    "idEstoque" INTEGER,
    "estado" TEXT,
    "estoque" JSONB,
    "codigoCrvAtual" TEXT,
    "assinaturaEnviadaEm" TIMESTAMP(3),
    "atpveNumero" TEXT,
    "sincronizadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "renave_registros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "renave_registros_vehicleId_ambiente_key" ON "renave_registros"("vehicleId", "ambiente");
ALTER TABLE "renave_registros" ADD CONSTRAINT "renave_registros_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "renave_operacoes" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "operacao" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "http" INTEGER,
    "mensagem" TEXT,
    "pedido" JSONB,
    "resposta" JSONB,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "renave_operacoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "renave_operacoes_vehicleId_createdAt_idx" ON "renave_operacoes"("vehicleId", "createdAt");
ALTER TABLE "renave_operacoes" ADD CONSTRAINT "renave_operacoes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
