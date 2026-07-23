-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "capitalBeneficiaryId" TEXT;

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "capitalBeneficiaryId" TEXT;

-- AlterTable
ALTER TABLE "recurring_entries" ADD COLUMN     "capitalBeneficiaryId" TEXT;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_capitalBeneficiaryId_fkey" FOREIGN KEY ("capitalBeneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_capitalBeneficiaryId_fkey" FOREIGN KEY ("capitalBeneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
