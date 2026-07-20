-- Fechamento mensal: registro por competência + vínculo das transações de
-- capital geradas (zeragem do L/P e pró-labore) para estorno na reabertura.
CREATE TABLE "monthly_closings" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "result" DOUBLE PRECISION NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "monthly_closings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "monthly_closings_year_month_key" ON "monthly_closings"("year", "month");

ALTER TABLE "capital_transactions" ADD COLUMN "monthlyClosingId" TEXT;
ALTER TABLE "capital_transactions"
  ADD CONSTRAINT "capital_transactions_monthlyClosingId_fkey"
  FOREIGN KEY ("monthlyClosingId") REFERENCES "monthly_closings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "capital_beneficiaries" ADD COLUMN "includeInMonthlyClosing" BOOLEAN NOT NULL DEFAULT false;
