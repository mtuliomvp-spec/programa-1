-- AlterTable
ALTER TABLE "capital_beneficiaries" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "capital_beneficiaries_userId_key" ON "capital_beneficiaries"("userId");

-- AddForeignKey
ALTER TABLE "capital_beneficiaries" ADD CONSTRAINT "capital_beneficiaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
