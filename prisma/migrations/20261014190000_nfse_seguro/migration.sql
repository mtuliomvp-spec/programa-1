-- NFS-e de comissão do seguro: tomador próprio por financeira e vínculo com a venda.
ALTER TABLE "financial_accounts" ADD COLUMN "nfseTomadorSeguroId" TEXT;
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_nfseTomadorSeguroId_fkey" FOREIGN KEY ("nfseTomadorSeguroId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_servico" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'RETORNO';
UPDATE "notas_servico" SET "tipo" = 'SEGURO' WHERE "descricao" ILIKE '%segur%';
ALTER TABLE "sales" ADD COLUMN "insuranceNfseId" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_insuranceNfseId_fkey" FOREIGN KEY ("insuranceNfseId") REFERENCES "notas_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sales_insuranceNfseId_idx" ON "sales"("insuranceNfseId");
