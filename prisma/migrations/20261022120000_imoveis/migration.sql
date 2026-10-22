-- Imóveis: cadastro, documentos e vínculo com contas a pagar e recorrências
-- (com a recorrência "a cada N meses", para o ITR anual).

-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "imovelId" TEXT;

-- AlterTable
ALTER TABLE "recurring_entries" ADD COLUMN     "imovelId" TEXT,
ADD COLUMN     "intervalMonths" INTEGER;

-- CreateTable
CREATE TABLE "imoveis" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'RURAL',
    "proprietario" TEXT,
    "capitalBeneficiaryId" TEXT,
    "endereco" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "area" TEXT,
    "cib" TEXT,
    "inscricaoMunicipal" TEXT,
    "matricula" TEXT,
    "cartorio" TEXT,
    "notes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imoveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imovel_anexos" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "exercicio" INTEGER,
    "description" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "completo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imovel_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imovel_anexos_imovelId_idx" ON "imovel_anexos"("imovelId");

-- CreateIndex
CREATE INDEX "payables_imovelId_idx" ON "payables"("imovelId");

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_entries" ADD CONSTRAINT "recurring_entries_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imoveis" ADD CONSTRAINT "imoveis_capitalBeneficiaryId_fkey" FOREIGN KEY ("capitalBeneficiaryId") REFERENCES "capital_beneficiaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imovel_anexos" ADD CONSTRAINT "imovel_anexos_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

