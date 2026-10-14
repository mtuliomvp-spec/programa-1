-- Retorno da venda financiada coberto por uma NFS-e de comissão.
ALTER TABLE "sales" ADD COLUMN "returnNfseId" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_returnNfseId_fkey" FOREIGN KEY ("returnNfseId") REFERENCES "notas_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sales_returnNfseId_idx" ON "sales"("returnNfseId");
