-- Combo de pagamentos: cesta persistente de títulos a pagar quitados em conjunto.

CREATE TYPE "ComboStatus" AS ENUM ('ABERTO', 'SOLICITADO', 'PAGO', 'CANCELADO');

CREATE TABLE "payment_combos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ComboStatus" NOT NULL DEFAULT 'ABERTO',
    "notes" TEXT,
    "userId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_combos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payables" ADD COLUMN "paymentComboId" TEXT;
CREATE INDEX "payables_paymentComboId_idx" ON "payables"("paymentComboId");

ALTER TABLE "payment_combos" ADD CONSTRAINT "payment_combos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_combos" ADD CONSTRAINT "payment_combos_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_paymentComboId_fkey" FOREIGN KEY ("paymentComboId") REFERENCES "payment_combos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
