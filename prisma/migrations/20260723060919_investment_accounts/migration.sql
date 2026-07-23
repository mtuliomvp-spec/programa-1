-- CreateEnum
CREATE TYPE "TipoAplicacao" AS ENUM ('APLICAR', 'RESGATAR', 'RENDIMENTO', 'SUBSTITUICAO');

-- DropIndex
DROP INDEX "payables_beneficiaryUserId_idx";

-- DropIndex
DROP INDEX "payables_saleId_idx";

-- DropIndex
DROP INDEX "pre_sales_sellerId_idx";

-- DropIndex
DROP INDEX "sales_sellerId_idx";

-- DropIndex
DROP INDEX "users_profileId_idx";

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "isInvestment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payables" ALTER COLUMN "publicToken" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pre_sales" ALTER COLUMN "publicToken" DROP DEFAULT;

-- CreateTable
CREATE TABLE "investment_allocations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "kind" "TipoAplicacao" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "transferId" TEXT,
    "receivableId" TEXT,
    "payableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investment_allocations_accountId_idx" ON "investment_allocations"("accountId");

-- CreateIndex
CREATE INDEX "investment_allocations_beneficiaryId_idx" ON "investment_allocations"("beneficiaryId");

-- AddForeignKey
ALTER TABLE "investment_allocations" ADD CONSTRAINT "investment_allocations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_allocations" ADD CONSTRAINT "investment_allocations_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
