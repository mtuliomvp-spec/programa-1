-- Devolução de compra: registro da NF de devolução e do título cancelado
CREATE TABLE "devolucoes_compra" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierNome" TEXT,
    "payableId" TEXT,
    "total" BOOLEAN NOT NULL DEFAULT false,
    "tituloNumero" INTEGER,
    "tituloDescricao" TEXT NOT NULL,
    "tituloDocumento" TEXT,
    "tituloValor" DOUBLE PRECISION NOT NULL,
    "tituloVencimento" TIMESTAMP(3),
    "veiculoPlaca" TEXT,
    "nfCompraNumero" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "nfeChave" TEXT NOT NULL,
    "nfeNumero" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devolucoes_compra_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "devolucoes_compra_supplierId_nfCompraNumero_idx" ON "devolucoes_compra"("supplierId", "nfCompraNumero");
CREATE INDEX "devolucoes_compra_nfeChave_idx" ON "devolucoes_compra"("nfeChave");
ALTER TABLE "devolucoes_compra" ADD CONSTRAINT "devolucoes_compra_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "devolucao_compra_anexos" (
    "id" TEXT NOT NULL,
    "devolucaoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devolucao_compra_anexos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "devolucao_compra_anexos_devolucaoId_idx" ON "devolucao_compra_anexos"("devolucaoId");
ALTER TABLE "devolucao_compra_anexos" ADD CONSTRAINT "devolucao_compra_anexos_devolucaoId_fkey" FOREIGN KEY ("devolucaoId") REFERENCES "devolucoes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
