-- AlterTable
ALTER TABLE "capital_transactions" ADD COLUMN     "stockInterestRunId" TEXT;

-- AlterTable
ALTER TABLE "vehicle_costs" ADD COLUMN     "stockInterestRunId" TEXT;

-- CreateTable
CREATE TABLE "stock_interest_runs" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "totalInterest" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_interest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capital_transactions_stockInterestRunId_idx" ON "capital_transactions"("stockInterestRunId");

-- CreateIndex
CREATE INDEX "vehicle_costs_stockInterestRunId_idx" ON "vehicle_costs"("stockInterestRunId");
