-- CreateEnum
CREATE TYPE "StatusConsorcio" AS ENUM ('ATIVO', 'CONTEMPLADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "TipoCentroCusto" AS ENUM ('OBRA', 'IMOVEL', 'OUTRO');

-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "consortiumId" TEXT,
ADD COLUMN     "costCenterId" TEXT;

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "costCenterId" TEXT;

-- CreateTable
CREATE TABLE "consortiums" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "administrator" TEXT,
    "creditValue" DOUBLE PRECISION NOT NULL,
    "installmentValue" DOUBLE PRECISION NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusConsorcio" NOT NULL DEFAULT 'ATIVO',
    "contemplatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consortiums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TipoCentroCusto" NOT NULL DEFAULT 'OUTRO',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_consortiumId_fkey" FOREIGN KEY ("consortiumId") REFERENCES "consortiums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
