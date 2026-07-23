-- AddForeignKey
ALTER TABLE "recurring_entries" ADD CONSTRAINT "recurring_entries_capitalBeneficiaryId_fkey" FOREIGN KEY ("capitalBeneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
