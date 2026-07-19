-- Token público da pré-venda para a verificação da Ficha de Negócio via QR Code.
-- gen_random_uuid() (nativo no PostgreSQL 13+) preenche as linhas existentes.
ALTER TABLE "pre_sales" ADD COLUMN "publicToken" TEXT NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "pre_sales_publicToken_key" ON "pre_sales"("publicToken");
