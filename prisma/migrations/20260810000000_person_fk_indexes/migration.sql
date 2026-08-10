-- Índices nas chaves estrangeiras de fornecedor e cliente.
--
-- O Postgres NÃO indexa chave estrangeira sozinho; até aqui só
-- payables(supplierId) tinha índice. Estes são usados pela unificação de
-- cadastros repetidos (UPDATE ... WHERE supplierId IN (...) nas cinco tabelas
-- filhas, e o mesmo para cliente), pela contagem de vínculos antes de excluir
-- um fornecedor e pelos "_count" das listagens.
--
-- DDL puramente aditivo: não toca em nenhum dado, valor ou saldo.

CREATE INDEX IF NOT EXISTS "vehicles_supplierId_idx" ON "vehicles"("supplierId");
CREATE INDEX IF NOT EXISTS "parts_supplierId_idx" ON "parts"("supplierId");
CREATE INDEX IF NOT EXISTS "recurring_entries_supplierId_idx" ON "recurring_entries"("supplierId");
CREATE INDEX IF NOT EXISTS "purchase_requests_supplierId_idx" ON "purchase_requests"("supplierId");

CREATE INDEX IF NOT EXISTS "sales_customerId_idx" ON "sales"("customerId");
CREATE INDEX IF NOT EXISTS "part_sales_customerId_idx" ON "part_sales"("customerId");
CREATE INDEX IF NOT EXISTS "receivables_customerId_idx" ON "receivables"("customerId");
CREATE INDEX IF NOT EXISTS "recurring_entries_customerId_idx" ON "recurring_entries"("customerId");
CREATE INDEX IF NOT EXISTS "pre_sales_customerId_idx" ON "pre_sales"("customerId");
