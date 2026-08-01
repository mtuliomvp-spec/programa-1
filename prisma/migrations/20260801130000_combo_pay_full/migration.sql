-- Combo: opção de pagar o valor integral mesmo com saldo devedor (sem abater).
ALTER TABLE "payment_combos" ADD COLUMN "payFull" BOOLEAN NOT NULL DEFAULT false;
