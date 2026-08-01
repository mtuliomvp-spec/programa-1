-- Combo: quanto foi abatido no saldo devedor de capital do beneficiário na baixa.
ALTER TABLE "payment_combos" ADD COLUMN "capitalAbatement" DOUBLE PRECISION NOT NULL DEFAULT 0;
