-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'company',
    "razaoSocial" TEXT NOT NULL DEFAULT 'MVP Veículos',
    "nomeFantasia" TEXT NOT NULL DEFAULT 'MVP Veículos',
    "cnpj" TEXT,
    "inscricaoEstadual" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "uf" TEXT,
    "logoDataUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);
