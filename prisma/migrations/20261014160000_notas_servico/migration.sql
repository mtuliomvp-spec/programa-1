-- NFS-e (padrão nacional) de comissão emitidas pelo sistema (Focus NFe).
CREATE TABLE "notas_servico" (
    "id" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSANDO',
    "tomadorId" TEXT,
    "tomadorNome" TEXT NOT NULL,
    "tomadorDocumento" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "numero" TEXT,
    "codigoVerificacao" TEXT,
    "url" TEXT,
    "urlDanfse" TEXT,
    "caminhoXml" TEXT,
    "mensagem" TEXT,
    "payload" JSONB NOT NULL,
    "emitidaPor" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "justificativaCancelamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notas_servico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notas_servico_ref_key" ON "notas_servico"("ref");
CREATE INDEX "notas_servico_tomadorId_idx" ON "notas_servico"("tomadorId");
ALTER TABLE "notas_servico" ADD CONSTRAINT "notas_servico_tomadorId_fkey" FOREIGN KEY ("tomadorId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
