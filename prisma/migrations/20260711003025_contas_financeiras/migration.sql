-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('CAIXA', 'BANCO', 'POUPANCA', 'OUTRO');

-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "accountId" TEXT;

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TipoConta" NOT NULL DEFAULT 'CAIXA',
    "bankName" TEXT,
    "agency" TEXT,
    "accountNumber" TEXT,
    "initialBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_transfers" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_transfers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_toId_fkey" FOREIGN KEY ("toId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
