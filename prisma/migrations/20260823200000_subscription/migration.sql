-- Assinatura da plataforma: contrato, mensalidades pagas e via assinada.
CREATE TABLE IF NOT EXISTS "subscription" (
  "id"               TEXT NOT NULL DEFAULT 'subscription',
  "status"           TEXT NOT NULL DEFAULT 'TESTE',
  "planName"         TEXT NOT NULL DEFAULT 'Padrão',
  "monthlyAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dueDay"           INTEGER NOT NULL DEFAULT 10,
  "nextChargeAt"     TIMESTAMP(3),
  "startedAt"        TIMESTAMP(3),
  "notes"            TEXT,
  "providerName"     TEXT,
  "providerDocument" TEXT,
  "providerAddress"  TEXT,
  "providerEmail"    TEXT,
  "providerPhone"    TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "competencia"    TEXT NOT NULL,
  "paidAt"         TIMESTAMP(3) NOT NULL,
  "amount"         DOUBLE PRECISION NOT NULL,
  "method"         TEXT,
  "notes"          TEXT,
  "proofFilename"  TEXT,
  "proofMimeType"  TEXT,
  "proofSize"      INTEGER,
  "proofData"      BYTEA,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscription_contracts" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "signedAt"       TIMESTAMP(3),
  "notes"          TEXT,
  "filename"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "size"           INTEGER NOT NULL,
  "data"           BYTEA NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_contracts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subscription_payments_subscriptionId_paidAt_idx"
  ON "subscription_payments"("subscriptionId", "paidAt");
CREATE INDEX IF NOT EXISTS "subscription_contracts_subscriptionId_idx"
  ON "subscription_contracts"("subscriptionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'subscription_payments_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "subscription_payments"
      ADD CONSTRAINT "subscription_payments_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'subscription_contracts_subscriptionId_fkey'
  ) THEN
    ALTER TABLE "subscription_contracts"
      ADD CONSTRAINT "subscription_contracts_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
