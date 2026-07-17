-- Dados bancários do fornecedor (para a Ordem de Pagamento)
ALTER TABLE "suppliers"
    ADD COLUMN "bankName" TEXT,
    ADD COLUMN "bankAgency" TEXT,
    ADD COLUMN "bankAccount" TEXT,
    ADD COLUMN "bankAccountType" TEXT,
    ADD COLUMN "pixKey" TEXT;

-- Token público para verificação da Ordem de Pagamento via QR Code.
-- gen_random_uuid() (nativo no PostgreSQL 13+) preenche as linhas existentes.
ALTER TABLE "payables" ADD COLUMN "publicToken" TEXT NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "payables_publicToken_key" ON "payables"("publicToken");
