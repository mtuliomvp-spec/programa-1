-- Combo: forma de recebimento escolhida pelo solicitante ("conta" | "pix").
ALTER TABLE "payment_combos" ADD COLUMN "payoutMethod" TEXT;
