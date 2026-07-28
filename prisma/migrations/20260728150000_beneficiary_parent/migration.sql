-- AlterTable
ALTER TABLE "capital_beneficiaries" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "capital_beneficiaries_parentId_idx" ON "capital_beneficiaries"("parentId");

-- AddForeignKey
ALTER TABLE "capital_beneficiaries" ADD CONSTRAINT "capital_beneficiaries_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
