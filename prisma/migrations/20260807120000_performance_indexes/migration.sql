-- Índices de leitura que faltavam. A tabela de títulos já passou de mil linhas e
-- toda listagem/filtro/relatório fazia varredura completa; a movimentação de
-- capital não tinha índice nenhum por título, então cada baixa e cada exclusão
-- varria a tabela inteira.
--
-- Só cria índices (DDL aditivo): não altera nenhum dado, valor ou saldo.
-- Idempotente (IF NOT EXISTS). Nomes no padrão do Prisma para o schema seguir
-- casando com o banco.

-- Contas a pagar: ordenação e filtros da tela, DRE e buscas por origem.
CREATE INDEX IF NOT EXISTS "payables_dueDate_idx" ON "payables"("dueDate");
CREATE INDEX IF NOT EXISTS "payables_status_dueDate_idx" ON "payables"("status", "dueDate");
CREATE INDEX IF NOT EXISTS "payables_status_paymentDate_idx" ON "payables"("status", "paymentDate");
CREATE INDEX IF NOT EXISTS "payables_accountId_idx" ON "payables"("accountId");
CREATE INDEX IF NOT EXISTS "payables_supplierId_idx" ON "payables"("supplierId");
CREATE INDEX IF NOT EXISTS "payables_vehicleId_idx" ON "payables"("vehicleId");
CREATE INDEX IF NOT EXISTS "payables_partId_idx" ON "payables"("partId");
CREATE INDEX IF NOT EXISTS "payables_saleId_idx" ON "payables"("saleId");
CREATE INDEX IF NOT EXISTS "payables_beneficiaryUserId_idx" ON "payables"("beneficiaryUserId");
CREATE INDEX IF NOT EXISTS "payables_capitalBeneficiaryId_idx" ON "payables"("capitalBeneficiaryId");
CREATE INDEX IF NOT EXISTS "payables_recurringId_idx" ON "payables"("recurringId");
CREATE INDEX IF NOT EXISTS "payables_consortiumId_idx" ON "payables"("consortiumId");
CREATE INDEX IF NOT EXISTS "payables_employeeId_idx" ON "payables"("employeeId");
CREATE INDEX IF NOT EXISTS "payables_purchaseRequestId_idx" ON "payables"("purchaseRequestId");
CREATE INDEX IF NOT EXISTS "payables_documentNumber_idx" ON "payables"("documentNumber");

-- Capital: usado em toda baixa (syncPayableCapital) e na exclusão de títulos.
CREATE INDEX IF NOT EXISTS "capital_transactions_payableId_idx" ON "capital_transactions"("payableId");
CREATE INDEX IF NOT EXISTS "capital_transactions_receivableId_idx" ON "capital_transactions"("receivableId");
