-- Financeira (conta de Contas e caixas) ligada ao cadastro fiscal do tomador da NFS-e.
ALTER TABLE "financial_accounts" ADD COLUMN "nfseTomadorId" TEXT;
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_nfseTomadorId_fkey" FOREIGN KEY ("nfseTomadorId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_servico" ADD COLUMN "financeiraId" TEXT;
