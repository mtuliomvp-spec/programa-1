-- Combo com abatimento de saldo devedor lançado pelo Banco Neutro.
ALTER TABLE "payment_combos" ADD COLUMN "abatementTransferId" TEXT;
ALTER TABLE "payment_combos" ADD COLUMN "abatementNeutro" BOOLEAN NOT NULL DEFAULT false;
