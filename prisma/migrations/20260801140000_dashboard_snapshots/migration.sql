-- Snapshot da posição patrimonial arquivado no fechamento do caixa (Boletim de Caixa).
CREATE TABLE "dashboard_snapshots" (
    "id" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedBy" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dashboard_snapshots_referenceDate_idx" ON "dashboard_snapshots"("referenceDate");
