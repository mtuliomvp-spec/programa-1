-- Números sequenciais (a partir de 1) para ordem de compra e de venda.
-- SERIAL preenche as linhas existentes na ordem em que foram inseridas.
ALTER TABLE "vehicles" ADD COLUMN "orderNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "vehicles_orderNumber_key" ON "vehicles"("orderNumber");

ALTER TABLE "sales" ADD COLUMN "orderNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "sales_orderNumber_key" ON "sales"("orderNumber");
