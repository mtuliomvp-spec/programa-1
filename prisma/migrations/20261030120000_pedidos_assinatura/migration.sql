-- CreateTable
CREATE TABLE "pedidos_assinatura" (
    "id" TEXT NOT NULL,
    "nomeLoja" TEXT NOT NULL,
    "cnpj" TEXT,
    "responsavel" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mensagem" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOVO',
    "avisado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_assinatura_createdAt_idx" ON "pedidos_assinatura"("createdAt");
