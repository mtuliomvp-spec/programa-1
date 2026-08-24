-- Simulador de financiamento na vitrine.
ALTER TABLE "company_settings" ADD COLUMN "showroomSimulator" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "financing_rates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bcbInstitution" TEXT,
    "monthlyRate" DOUBLE PRECISION,
    "maxInstallments" INTEGER NOT NULL DEFAULT 48,
    "minDownPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bcbMonthlyRate" DOUBLE PRECISION,
    "bcbYearlyRate" DOUBLE PRECISION,
    "bcbReferenceDate" TIMESTAMP(3),
    "bcbFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financing_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financing_rates_name_key" ON "financing_rates"("name");
