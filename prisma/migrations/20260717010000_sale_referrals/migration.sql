-- Indicações de venda ([{ name, amount }]) — cada uma vira conta a pagar (Comissão)
ALTER TABLE "pre_sales" ADD COLUMN "referrals" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "sales" ADD COLUMN "referrals" JSONB NOT NULL DEFAULT '[]';
