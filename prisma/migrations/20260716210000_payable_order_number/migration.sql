-- Número sequencial da Ordem de Pagamento (SERIAL preenche as linhas existentes)
ALTER TABLE "payables" ADD COLUMN "orderNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "payables_orderNumber_key" ON "payables"("orderNumber");
