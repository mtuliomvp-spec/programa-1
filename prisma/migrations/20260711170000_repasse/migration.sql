-- Compra com repasse/troca: quitação (saldo devedor) + débitos abatendo o
-- líquido pago ao vendedor.
ALTER TABLE "vehicles" ADD COLUMN "payoffAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "vehicles" ADD COLUMN "payoffTo" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "debtsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
