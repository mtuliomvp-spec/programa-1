-- "Já caiu" do seguro: fila do caixa e quem pagou a comissão
ALTER TABLE "sales" ADD COLUMN "insurancePayer" TEXT;
ALTER TABLE "sales" ADD COLUMN "pendingInsuranceDate" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "pendingInsuranceAmount" DOUBLE PRECISION;
ALTER TABLE "sales" ADD COLUMN "pendingInsuranceCommission" DOUBLE PRECISION;
ALTER TABLE "sales" ADD COLUMN "pendingInsuranceAccountId" TEXT;
ALTER TABLE "sales" ADD COLUMN "pendingInsurancePayer" TEXT;
